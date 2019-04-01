# frozen_string_literal: true

require 'dotenv'
Dotenv.load

require 'sinatra'
require 'sinatra/reloader' if development?
require 'json'
require 'sinatra/content_for'
require 'httparty'
require 'yaml'

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
  new_hash[id] = { 'settings' => settings }
  File.open(USERS_HASH_LOCATION, 'w') { |file| file.write(new_hash.to_yaml) }
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

post '/api/user_settings/:user_id' do
  user_id = params[:user_id].to_i
  settings_hash = Rack::Utils.parse_nested_query(request.body.read)
  settings_json = JSON.generate(settings_hash)

  commit_settings_to_user_hash(user_id, settings_json)

  status 200
  settings_json
end

get '/api/user_settings/:user_id' do
  user_id = params[:user_id].to_i
  settings = get_user_settings(user_id) || JSON_DEFAULT_SETTINGS

  settings
end

get '/api/default_user_settings' do
  JSON_DEFAULT_SETTINGS
end

get '/youtube_resource' do
  query_hash = get_query_hash(params)
  query_string = Rack::Utils.build_query(query_hash)
  url = get_url(params['q_type'])

  HTTParty.get("#{url}?#{query_string}").to_s
end

not_found do
  status 404
  erb :oops
end

error 403 do
  'The requested resource cannot be found'
end
