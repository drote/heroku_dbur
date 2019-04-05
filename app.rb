# frozen_string_literal: true
require 'pry'
require 'dotenv'
Dotenv.load

require 'sinatra'
require 'sinatra/reloader' if development?
require 'json'
require 'sinatra/content_for'
require 'httparty'
require 'yaml'

DEMO_FEED_RESULTS = [
  {
    href: '/results?query=ארץ+נהדרת',
    img: 'https://i.ytimg.com/vi/5Ce7lEqt_nQ/mqdefault.jpg',
    title: 'ארץ נהדרת'
  },
]

DEFAULT_SETTINGS = {
  gaze_aware: 'on',
  gaze_aware_rest: 'on',
  select_delay: '5',
  click_delay: '15',
  col_number: '4',
  row_number: '3',
  background_color: '#c4c4c4',
  select_color: '#e89999',
  controls_location: 'left',
  controls_width: '18',
  open_in_youtube: 'off',
  show_controls: 'off',
}.freeze

YEAR_FROM_NOW = Time.now + (3600 * 24 * 365)
JSON_DEFAULT_SETTINGS = JSON.generate(DEFAULT_SETTINGS)
YT_ROOT = 'https://www.googleapis.com/youtube/v3'
USERS_HASH_LOCATION = 'public/data/users.yml'
INFO_FIELDS = 'items(snippet(title,description,thumbnails(medium(url))))'

SEARCH_FIELDS = 'nextPageToken,items(id(videoId),'\
                'snippet(title,description,thumbnails(${}(url))))'

REALTED_FIELDS = 'nextPageToken,items(id(videoId),'\
                 'snippet(title,description,thumbnails(${}(url))))'

PLAYLIST_FIELDS = 'nextPageToken,items(snippet(resourceId(videoId),'\
                  'title,description,thumbnails(${}(url))))'

CHANNEL_FIELDS = 'nextPageToken,items(id(videoId)'\
                 ',snippet(title,description,thumbnails(${}(url))))'

YT_LOCATIONS = {
  'playlist' => '/playlistItems',
  'playlist_info' => '/playlists',
  'vid_info' => '/videos',
  'chan_info' => '/channels'
}.freeze

def get_url(q_type)
  location = YT_LOCATIONS[q_type] || '/search'
  YT_ROOT + location
end

def get_search_hash(query, thumb_size)
  { 'q' => query, 'fields' => SEARCH_FIELDS.sub('${}', thumb_size) }
end

def get_related_hash(id, thumb_size)
  { 'relatedToVideoId' => id,
    'fields' => REALTED_FIELDS.sub('${}', thumb_size) }
end

def get_playlist_hash(id, thumb_size)
  { 'playlistId' => id, 'fields' => PLAYLIST_FIELDS.sub('${}', thumb_size) }
end

def get_channel_hash(id, thumb_size)
  { 'channelId' => id, 'order' => 'date',
    'fields' => CHANNEL_FIELDS.sub('${}', thumb_size) }
end

def get_info_hash(id)
  { 'id' => id, 'fields' => INFO_FIELDS }
end

def get_query_hash(params)
  query = get_query(params['q_type'], params['q_param'], params['thumb_size'])
  query['maxResults'] = params['max_results']
  query['part'] = 'snippet'
  query['videoEmbeddable'] = params['search_embeddable']
  query['key'] = ENV['YT_API_KEY']
  query['pageToken'] = params['token'] unless params['token'].nil?
  query['type'] = 'video' unless params['q_type'] =~ /info/

  query
end

def get_query(q_type, q_param, thumb_size)
  case q_type
  when 'search' then get_search_hash(q_param, thumb_size)
  when 'playlist' then get_playlist_hash(q_param, thumb_size)
  when 'related_videos' then get_related_hash(q_param, thumb_size)
  when 'channel' then get_channel_hash(q_param, thumb_size)
  else get_info_hash(q_param)
  end
end

def users_hash
  YAML.safe_load(File.read(USERS_HASH_LOCATION))
end

def set_cookie_and_log_new_user
  user_id = next_user_id

  make_new_cookie(user_id)
  log_new_user_to_users_hash(user_id)
end

def commit_settings_to_user_hash(id, settings)
  new_hash = users_hash.clone
  new_hash[id] ||= {}
  new_hash[id]['settings'] = settings
  File.open(USERS_HASH_LOCATION, 'w') { |file| file.write(new_hash.to_yaml) }
end

def feed_has_id(feed, id)
  feed.map { |resource| resource['id'] }.include?(id)
end

def add_resource_to_user_feed(user_id, resource_hash)
  new_hash = users_hash.clone
  new_hash[user_id]['feed'] ||= []
  new_hash[user_id]['feed'] << resource_hash
    
  File.open(USERS_HASH_LOCATION, 'w') { |file| file.write(new_hash.to_yaml) }
end

def edit_resource_in_feed(user_id, resource_id, resource_hash)
  new_hash = users_hash.clone
  idx = new_hash[user_id]['feed'].index { |resource| resource['id'] == resource_id }
  new_hash[user_id]['feed'][idx] = resource_hash

  File.open(USERS_HASH_LOCATION, 'w') { |file| file.write(new_hash.to_yaml) }
end

def delete_resource_from_feed(user_id, resource_id)
  new_hash = users_hash.clone
  idx = new_hash[user_id]['feed'].index { |resource| resource['id'] == resource_id }
  new_hash[user_id]['feed'].delete_at(idx)

  File.open(USERS_HASH_LOCATION, 'w') { |file| file.write(new_hash.to_yaml) }
end

def log_last_id(user_id, last_id)
  new_hash = users_hash.clone
  new_hash[user_id]['last_feed_id'] = last_id.to_i
  File.open(USERS_HASH_LOCATION, 'w') { |file| file.write(new_hash.to_yaml) }
end

def get_user_feed(user_id)
  users_hash[user_id]['feed']
end

def log_new_user_to_users_hash(id)
  commit_settings_to_user_hash(id, nil)
end

def make_new_cookie(id)
  response.set_cookie('id', value: id,
                            expires: YEAR_FROM_NOW,
                            secret: ENV['SESSION_SECRET'])
end

def get_user_settings(id)
  users_hash[id]['settings']
end

def set_user_settings(id, settings_json)
  commit_settings_to_user_hash(id, settings_json)
end

def next_user_id
  return 0 if users_hash.empty?

  users_hash.keys.max + 1
end

def next_feed_id(user_id)
  feed = users_hash[user_id]['feed']

  if !users_hash[user_id]['last_feed_id']
    next_id = 0
  else
    next_id = users_hash[user_id]['last_feed_id'] + 1
  end

  log_last_id(user_id, next_id)
  next_id
end

def make_resource_html(resource)
  """<div href='#{resource['href']}' class='wrapper editing' id='wrapper_#{resource['id']}'>
    <div class='edit_bar'>
      <a class='delete_wrapper'></a>
      <a class='edit_wrapper'></a>
    </div>
    <figure>
      <img src='#{resource['img']}'>
      <figcaption>#{resource['title']}</figcaption>
    </figure>
  </div>"""
end

before do
  set_cookie_and_log_new_user unless request.cookies['id']
end

get '/' do
  redirect '/search'
end

get '/search' do
  @title = 'D-Bur Tube'
  erb :search_he
end

get '/results' do
  @user_id = request.cookies['id']

  erb :results_he
end

get '/settings' do
  @title = 'הגדרות משתמש'
  @user_id = request.cookies['id']

  erb :settings_he
end

get '/feed_resource_form' do
  @user_id = request.cookies['id'].to_i
  @resource_idx = next_feed_id(@user_id)

  erb :new_feed_resource, :layout => false
end

get '/edit_resource/:id' do
  @user_id = request.cookies['id'].to_i
  @resource_idx = params[:id].to_i

  erb :new_feed_resource, :layout => false
end

get '/youtube_resource' do
  query_hash = get_query_hash(params)
  query_string = Rack::Utils.build_query(query_hash)
  url = get_url(params['q_type'])

  HTTParty.get("#{url}?#{query_string}").to_s
end

get '/api/default_user_settings' do
  JSON_DEFAULT_SETTINGS
end

get '/api/user_feed/:user_id' do
  user_id = params[:user_id].to_i
  feed = JSON.generate(get_user_feed(user_id))

  status 200
  feed
end

post '/api/user_settings/:user_id' do
  user_id = params[:user_id].to_i
  settings_hash = Rack::Utils.parse_nested_query(request.body.read)
  settings_json = JSON.generate(settings_hash)

  commit_settings_to_user_hash(user_id, settings_json)

  status 200
  settings_json
end

post '/api/user_feed/:user_id' do
  user_id = params[:user_id].to_i
  new_resource = Rack::Utils.parse_nested_query(request.body.read)
  new_resource_preview = make_resource_html(new_resource)

  add_resource_to_user_feed(user_id, new_resource)

  status 200
  new_resource_preview
end

put '/api/user_feed/:user_id/:resource_id' do
  user_id = params[:user_id].to_i
  resource_id = params[:resource_id]
  new_resource = Rack::Utils.parse_nested_query(request.body.read)
  new_resource_preview = make_resource_html(new_resource)

  edit_resource_in_feed(user_id, resource_id, new_resource)

  status 200
  new_resource_preview
end

delete '/api/user_feed/:user_id/:resource_id' do
  user_id = params[:user_id].to_i
  resource_id = params[:resource_id]

  delete_resource_from_feed(user_id, resource_id)

  status 200
  resource_id
end

get '/api/user_settings/:user_id' do
  user_id = params[:user_id].to_i
  settings = get_user_settings(user_id) || JSON_DEFAULT_SETTINGS

  settings
end

not_found do
  status 404
  erb :oops
end

error 403 do
  'The requested resource cannot be found'
end

