	const ResultsManager = (function() {
		const YT_SEARCH_URL = '/search';
		const YT_PLAYLIST_URL= '/playlistItems';
		const YT_API_KEY = 'AIzaSyD0HiZ1FdFt3QK10ndUBUfddC6hyj19IW8';
		const YT_SEARCH_FIELDS = 'nextPageToken,items(id(videoId),snippet(title,thumbnails(high(url))))';
		const YT_PLAYLIST_FIELDS = 'nextPageToken,items(snippet(resourceId(videoId),title,thumbnails(high(url))))';
		const MAX_ALLOWED_VIDEOS = 100;

		const makeQueryString = (requestParams) => {
			let params = [];

			Object.keys(requestParams).forEach((prm) => {
				params.push(`${prm}=${requestParams[prm]}`);
			});

			return encodeURI(`${params.join('&')}`);
		}

		const parseForTemplate = (vid) => {
			let obj = {};

			obj['id'] = vid.id.videoId || vid.resourceId.videoId;
			obj['img'] = vid.snippet.thumbnails.high.url;
			obj['title'] = vid.snippet.title;

			return obj;
		}

		return {
			allResults: [],
			urlRoot: 'https://www.googleapis.com/youtube/v3',
			url: null,
			nextPageToken: null,

			requestParams: {
				key: YT_API_KEY,
				part: 'snippet',
				maxResults: null,
				fields: null,
				type: null,
				order: 'viewCount',
			},

			init(query, queryType, vidsPerPage) {
				this.initRequestParams(query, queryType, vidsPerPage);
				this.initUrl(queryType);

				return this;
			},
			initRequestParams(query, queryType, vidsPerPage) {
				if (queryType === 'searchQuery') {
					this.requestParams['q'] = query;
					this.requestParams.fields = YT_SEARCH_FIELDS;
				} else {
					this.requestParams['playlistId'] = query;
					this.requestParams['fields'] = YT_PLAYLIST_FIELDS;
				}

				this.requestParams.type = 'video';
				this.requestParams.maxResults = vidsPerPage;
			},
			initUrl(queryType) {
				let address = YT_SEARCH_URL;

				if (queryType === 'playlistVideos') {
					address = YT_PLAYLIST_URL;
				}

				this.url = this.urlRoot + address;
			},
			getResults(more) {
				if (more) {
					this.requestParams[nextPageToken] = this.nextPageToken;
				}

				let queryString = makeQueryString(this.requestParams);

				return this.fetch(queryString)
									 .then(function(response) => {
									 	 this.addResults(response.items, response.nextPageToken);
									 });
			},
			fetch(queryString) {
				return ajaxCall(this.url, queryString);
			},
			addResults(vids, nextPageToken) {
				this.allResults.push(vids.map(parseForTemplate));
				this.nextPageToken = nextPageToken;
			},
			getResultPage(n) {
				return this.allResults[n];
			},
			nOfPages() {
				return this.allResults.length;
			},
			nOfResults() {
				return this.allResults.map((page) => page.length)
									 .reduce((sum, current) => sum + current);
			},
			noMoreResults() {
				return !this.nextPageToken;
			},
			outOfQuota() {
				return this.nOfResults() >= MAX_ALLOWED_VIDEOS;
			}
		};
	})();
