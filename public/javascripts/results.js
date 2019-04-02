/*eslint-env jquery*/
/* global Handlebars */
/* global feather */
/* global playerReady */
/* global playerManager */

'use strict';

Handlebars.registerHelper('shortenTitle', (title) => {
	if (title.length > 80) {
		let newTitle = title.substring(0, 77);

		return `${newTitle.replace(/ $/, '')}...`;
	}

	return title;
});

Handlebars.registerHelper('isHebrew', (title) => {
	let charCode = title.charCodeAt(0);

	return charCode > 1488 && charCode < 1514;
});

$(function() {
	// JQUERY VARIABLES
	const $body = $(document.body);
	const $content = $('#content');
	const $playerContainer = $('#player_container');
	const $seperator = $('#seperator');
	const $templates = $('[type="text/handlebars-x"]');
	const $mainAndHeader = $('main, header');
	const $headerContentCenter = $('.header_content.center');
	const $title = $('title');
	const $userId = $('#user_id');
	const $controlsContainer = $('#controls');
	const PLAYER_DIVS = [$playerContainer, $seperator];

	// RESULTS MANAGER
	const ResultsManager = (function() {
		const MAX_ALLOWED_VIDEOS = 100;
		const YT_RESOURCE_URL = `/youtube_resource`;

		const makeQueryString = (queryParams) => {
			let params = [];

			Object.keys(queryParams).forEach((param) => {
				if (queryParams[param]) {
					params.push(`${param}=${queryParams[param]}`);
				}
			});

			return encodeURI(params.join('&'));
		}

		const youtubeResource = function(q_type, max_results, q_param, search_embeddable, token, thumb_size) {
			let queryString = makeQueryString({ q_type, max_results, q_param, search_embeddable, token, thumb_size });

			return $.ajax({
				url: YT_RESOURCE_URL,
				data: queryString,
				dataType: 'json',
			});
		}

		const parseForTemplate = function(vid) {
			let obj = {};
			let vidId;

			if (vid.id) {
				vidId = vid.id.videoId;
			} else {
				vidId = vid.snippet.resourceId.videoId;
			}

			obj['id'] = vidId;
			obj['img'] = vid.snippet.thumbnails[this.thumbSize].url;
			obj['title'] = vid.snippet.title;
			obj['description'] = vid.snippet.description;

			return obj;
		}

		return {
			allResults: null,
			query: null,
			queryType: null,
			maxResults: null,
			searchEmbeddable: null,
			nextPageToken: null,

			init(query, queryType, vidsPerPage, searchEmbeddable, thumbSize) {
				this.queryType = queryType;
				this.maxResults = vidsPerPage;
				this.query = query;
				this.searchEmbeddable = searchEmbeddable;
				this.thumbSize = thumbSize;
				this.allResults = [];

				return this;
			},
			getResults(more) {
				let that = this;
				let token;

				if (more) {
					token = this.nextPageToken;
				}

				return youtubeResource(this.queryType, this.maxResults, this.query, this.embeddableParam(), token, this.thumbSize)
							.then(function(response) {
								that.addResults(response.items, response.nextPageToken);
							});
			},
			getPlaylistInfo(id) {
				return youtubeResource('playlist_info', '1', id);
			},
			getVidInfo(id) {
				return youtubeResource('vid_info', '1', id);
			},
			getChannelInfo(id) {
				return youtubeResource('chan_info', '1', id);
			},
			addResults(vids, nextPageToken) {
				this.allResults.push(vids.map(parseForTemplate.bind(this)));
				this.nextPageToken = nextPageToken;
			},
			getResultPage(n) {
				return this.allResults[n];
			},
			nOfPages() {
				return this.allResults.length;
			},
			nOfResults() {
				return this.allResults.map((page) => page.length).reduce((sum, current) => sum + current);
			},
			noMoreResults() {
				return !this.nextPageToken;
			},
			outOfQuota() {
				return this.nOfResults() >= MAX_ALLOWED_VIDEOS;
			},
			embeddableParam() {
				return this.searchEmbeddable ? 'true' : 'any';
			},
		};
	})();

	//NAVIGATION MANAGER
	const NavigationManager = (function() {
		const directionToChange = {
			left() {
				return 1;
			},
			right() {
				return -1;
			},
			up() {
				return -this.colNumber;
			},
			down() {
				return this.colNumber;
			},
			pageDown() {
				return this.vidsPerPage;
			},
			pageUp() {
				return -this.vidsPerPage;
			},
		}

		return {
			init(colNumber, rowNumber) {
				this.colNumber = parseInt(colNumber, 10);
				this.rowNumber = parseInt(rowNumber, 10);
				this.vidsPerPage = this.colNumber * this.rowNumber;

				return this;
			},
			nextIdxAndPage(idx, direction) {
				let change = directionToChange[direction].call(this);
				let nextIdx = idx + change;
				let maxAllowedIdx = this.vidsPerPage - 1;
				let page = 'current';

				if (nextIdx > maxAllowedIdx) {
					nextIdx = this.nextOutOfBoundsIdx(idx, direction);
					page = 'next';
				} if (nextIdx < 0) {
					nextIdx = this.nextOutOfBoundsIdx(idx, direction);
					page = 'prev';
				}

				return { nextIdx, page };
			},
			nextOutOfBoundsIdx(idx, direction) {
				switch (direction) {
					case 'up':
					case 'down':
						idx = this.idxAcrossPage(idx, direction);
						break;
					case 'left':
						idx = 0;
						break;
					case 'right':
						idx = -1;
				}

				return idx;
			},
			idxAcrossPage(idx, direction) {
				let compensation = ((this.rowNumber - 1) * this.colNumber);

				if (direction === 'down') {
					compensation = -compensation;
				}

				return idx + compensation;
			},
		};
	})();

	//PAGE OBJECT
	const Page = (function() {
		const DEFAULT_SETTINGS_URL = '/api/default_user_settings';
		const SETTINGS_URL = '/api/user_settings/';
		const RELATED_VIDS_PAGE_URL = '/results?relatedToVidId=';
		const PLAY_IN_YT_URL = 'https://www.youtube.com/watch?v=';
		const ERROR_MSG = 'נתקלנו בבעיה. יש לרענן את הדף ולנסות שנית.'
		let timeoutVar;

		const FONT_THUMB_SIZES = {
			'5': {'font': '0.6rem', 'thumb': 'medium'},
			'4': {'font': '0.8rem', 'thumb': 'medium'},
			'3': {'font': '0.8rem', 'thumb': 'medium'},
			'2': {'font': '1rem', 'thumb': 'high'},
			'1': {'font': '1.4rem', 'thumb': 'high'},
		};

		const arrowKeys = {
			'37': 'left',
			'38': 'up',
			'39': 'right',
			'40': 'down',
		};

		const navCharCodeToKey = {
			'33': 'pageUp',
			'34': 'pageDown',
			'13': 'enter',
			'36': 'home',
			'71': 'g',
			'79': 'o',
			...arrowKeys,
		};

		const playCharCodeToKey = {
			'27': 'escape',
			'32': 'spacebar',
			'70': 'f',
			'75': 'k',
			'77': 'm',
			'82': 'r',
			'89': 'y',
			...arrowKeys,
		};

		const QUERY_TYPES = {
			'query': 'search',
			'listId': 'playlist',
			'chanId': 'channel',
			'relatedToVidId': 'related_videos',
			'vidId': 'direct_play',
		}

		const empty = ($elm) => $elm.length === 0;
		const activeAnimation = ($elm) => $elm.find('.progress_circle').length !== 0;
		const getFigSide = (div) => `${90 / div}%`;
		const getAnimationLength = (delayTime) => `${delayTime / 1000}s`;
		const getMainHeaderWidth = (controlsWidth) => `${100 - controlsWidth}%`;
		const getCotrolsWidth = (controlsWidth) => `${controlsWidth}%`;
		const getFontSize = (rowNum) => FONT_THUMB_SIZES[rowNum]['font'];
		const getThumbSize = (colNum) => FONT_THUMB_SIZES[colNum]['thumb'];
		const getRightMarginPercent = (colNum) => colNum === 1 ? '5%' : '2.5%';
		const getControlsFontSize = (controlsWidth) => controlsWidth < 11 ? '1rem' : '1.8rem';
		const getControlBGSize = (controlsWidth) => controlsWidth < 11 ? '70%' : 'calc(70vh / 4)';

		const ajaxCall = function(url, data) {
			return $.ajax({ url, data })
							.then((data) => data);
		}

		const settingsJsonToObj = (json) => {
			let settings = JSON.parse(json);

			Object.keys(settings).forEach((key) => {
				let val = settings[key];

				if ($.isNumeric(settings[key])) {
					val = parseInt(settings[key], 10);
				}

				settings[key] = val;
			});

			return settings;
		}

		const togglePlayerContent = (bool) => {
			PLAYER_DIVS.forEach(($div) => $div.toggle(bool));
			$content.toggle(!bool);
		}

		const navModeKeyEvent = function(key) {
			key = navCharCodeToKey[key];

			if (!key) return;

			this.respondToNavKey(key);
		}

		const playModeKeyEvent = function(key) {
			key = playCharCodeToKey[key];

			if (!key) return;

			this.respondToPlayKey(key);
		}

		const keydownHandler = function(e) {
			let key = String(e.which);

			if (this.playMode()) {
				playModeKeyEvent.call(this, key);
				return;
			}

			navModeKeyEvent.call(this, key);
		}

		const vidMouseIn = function(e) {
			if (this.gaInactive()) return;

			let $wrapper = $(e.target);

			if ($wrapper.is('.selected')) {
				this.gazeGeneric($wrapper);
				return;
			}

			this.gazeSelect($wrapper);
		}

		const mouseInGeneric = function(e) {
			if (this.gaInactive()) return;

			let $elm = $(e.currentTarget);

			this.gazeGeneric($elm);
		}

		const mouseOutGeneric = function(e) {
			if (this.gaInactive()) return;

			this.cancelGazeAction();
		}

		const vidClick = function(e) {
			let $wrapper = $(e.currentTarget);

			this.startVideo($wrapper);
		}

		const gaToggleClick = function() {
			let key = this.onGazeBreak() ? 'o' : 'g';

			this.respondToNavKey(key);
		}

		return {
			templates: {},
			query: null,
			resultsManager: null,
			playerManager: null,
			navigationManager: null,
			userSettings: null,
			userId: null,
			gazeBreak: false,

			init() {
				this.getTemplates();
				this.bindEvents();
				this.getParams();

				if (this.directPlay()) {
					this.directPlayProtocol();
					return;
				}

				this.searchVidsProtocol();
			},
			getTemplates() {
				let that = this;

				$templates.each(function() {
					let $temp = $(this);

					if ($temp.hasClass('partial')) {
						Handlebars.registerPartial($temp.attr('id'), $temp.html());
					}

					that.templates[$temp.attr('id')] = Handlebars.compile($temp.html());
				});

				$templates.remove();
			},
			bindEvents() {
				$body.on('keydown', keydownHandler.bind(this));
				$body.on('mouseenter', '.clickable', mouseInGeneric.bind(this));
				$body.on('mouseleave', '.clickable, .wrapper', mouseOutGeneric.bind(this));
				$body.on('click', '.clickable', this.cancelGazeAction.bind(this));
				$content.on('mouseenter', '.wrapper', vidMouseIn.bind(this));
				// $content.on('mouseleave', '.wrapper', vidMouseOut.bind(this));
				$content.on('click', '.wrapper', vidClick.bind(this));
				$controlsContainer.on('click', '#new_search', this.goHome);
				$controlsContainer.on('click', '#pg_up', () => this.respondToNavKey('pageUp'));
				$controlsContainer.on('click', '#pg_down', () => this.respondToNavKey('pageDown'));
				$controlsContainer.on('click', '#ga_break_toggle', gaToggleClick.bind(this));
				$controlsContainer.on('click', '#play_toggle', () => this.respondToPlayKey('k'));
				$controlsContainer.on('click', '#related_videos', () => this.respondToPlayKey('r'));
				$controlsContainer.on('click', '#exit', () => this.respondToPlayKey('escape'));
			},
			getParams() {
				const urlParams = new URLSearchParams(window.location.search);
				this.userId = $userId.html();

				for (let pair of urlParams.entries()) {
					this.queryType = QUERY_TYPES[pair[0]];
					this.query = pair[1];
				}

				$userId.remove();
			},
			searchVidsProtocol() {
				this.initSettings()
						.then(() => this.initResults())
						.then(() => {
							this.initDisplay();
							this.initNavigationManager();
							this.checkStartGazeBreak();
						})
						.fail(() => this.alertFailure());
			},
			directPlayProtocol() {
				this.initSettings()
						.then(() => this.startVidFromParams());
			},
			initSettings() {
				const that = this;

				return this.getUserSettings().then(function(response) {
									that.assignSettings(response);
								});
			},
			assignSettings(settings) {
				this.userSettings = settingsJsonToObj(settings);
			},
			getUserSettings() {
				return ajaxCall(`${SETTINGS_URL}${this.userId}`);
			},
			useDefaultSettings() {
				let that = this;

				return ajaxCall(DEFAULT_SETTINGS_URL).then(function(response) {
								that.assignSettings(response);
							});
			},
			initResults() {
				this.resultsManager = Object.create(ResultsManager)
																		.init(this.query, this.queryType,
																					this.vidsPerPage(), this.searchEmbeddable(),
																					getThumbSize(this.colNumber()));

				return this.resultsManager.getResults();
			},
			getMoreResults() {
				return this.resultsManager.getResults('more');
			},
			initDisplay() {
				feather.replace();

				this.currentPageNumber = 0;
				this.setCSSProperties();
				this.pushMainAndHeader(this.controlsFloat());
				this.initHeader();
				this.renderPageNumber(0);
				this.selectWrapper(0);

				if (this.showControls()) {
					this.initNavControls();
				}
			},
			setCSSProperties() {
				document.body.style.setProperty('--figuresPerRow', this.colNumber());
				document.body.style.setProperty('--figuresPerCol', this.rowNumber());

				$body.css({
					overflow: 'hidden',
					'--figureWidth': getFigSide(this.colNumber()),
					'--figureHeight': getFigSide(this.rowNumber()),
					'--figFontSize': getFontSize(this.rowNumber()),
					'--animationLength': getAnimationLength(this.gaClickTime()),
					'--BGColor': this.backgroundColor(),
					'--selectColor': this.chooserColor(),
					'--circleColor': `${this.chooserColor()}bf`,
					'--mainAndHeaderWidth': getMainHeaderWidth(this.controlsWidth()),
					'--controlsWidth': getCotrolsWidth(this.controlsWidth()),
					'--controlsFloat': this.controlsFloat(),
					'--controlsFont': getControlsFontSize(this.controlsWidth()),
					'--controlsBGSize': getControlBGSize(this.controlsWidth()),
				});
			},
			pushMainAndHeader(controlsFloat) {
				if (controlsFloat === 'right') {
					$mainAndHeader.css('left', 0);
					return;
				}

				$mainAndHeader.css('right', 0);
			},
			initHeader() {
				switch (this.queryType) {
					case 'playlist':
						this.setupPlaylistHeader();
						break;
					case 'channel':
						this.setupChannelHeader();
						break;
					case 'related_videos':
						this.setupRelatedVidsHeader();
						break;
					default:
						this.setupSearchHeader();
				}
			},
			initNavigationManager() {
				this.navigationManager = Object.create(NavigationManager).init(this.colNumber(), this.rowNumber());
			},
			directPlay() {
				return this.queryType === 'direct_play';
			},
			checkStartGazeBreak() {
				if (this.gaRestMode()) this.startGazeBreak();
			},
			setupSearchHeader() {
				this.adjustHeaderContent({title: this.query}, this.templates.search_header_template);
			},
			setupPlaylistHeader() {
				let infoFunc = this.resultsManager.getPlaylistInfo;
				let template = this.templates.playlist_header_template;

				this.getInfoSetHeader(infoFunc, template);
			},
			setupChannelHeader() {
				let infoFunc = this.resultsManager.getChannelInfo;
				let template = this.templates.channel_header_template;

				this.getInfoSetHeader(infoFunc, template);
			},
			setupRelatedVidsHeader() {
				let infoFunc = this.resultsManager.getVidInfo;
				let template = this.templates.related_vids_header_template;

				this.getInfoSetHeader(infoFunc, template);
			},
			getInfoSetHeader(infoFunc, template) {
				let that = this;
				infoFunc(this.query).then(function(data) {
					that.adjustHeaderContent(data.items[0], template);
				});
			},
			adjustHeaderContent(data, template) {
				let title = data.title || data.snippet.title;
				let html = template(data);

				$headerContentCenter.html(html);
				$title.text(`D-Bur Tube (${title})`);
			},
			initNavControls() {
				let gaButton = this.templates.ga_break_button_template();
				$controlsContainer.append(gaButton);

				this.renderNavControls();
				this.adjustGaRestButton();
			},
			renderNavControls() {
				let html = this.templates.nav_controls_template();
				$controlsContainer.children('.play_control').remove();
				$controlsContainer.append(html);

				setTimeout(() => {
					this.enableButtons($('.nav_control'));
				}, 1000);
			},
			renderPlayControls() {
				let html = this.templates.play_controls_template();
				$controlsContainer.children('.nav_control').remove();
				$controlsContainer.append(html);

				setTimeout(() => {
					this.enableButtons($('.play_control'));
				}, 1000);
			},
			enableButtons($buttons) {
				$buttons.addClass('clickable');
			},
			adjustGaRestButton() {
				let $button = $('#ga_break_toggle');

				if (!this.gaRestMode()) {
					$button.find('p').text('התחל מצב מנוחה');
					return;
				}

				$button.addClass('rest_mode');
			},
			togglePlaybuttonToPlaying() {
				let $button = $('#play_toggle');
				$button.addClass('playing');
			},
			renderPageNumber(n) {
				this.appendResultPageContent(n);
				this.fixWrapperMargins();
				this.currentPageNumber = n;
			},
			appendResultPageContent(n) {
				let vids = this.resultsManager.getResultPage(n);
				let html = this.templates.thumbnails_template({ vids }).replace('-->', '');

				$content.empty();
				$content.append(html);
			},
			fixWrapperMargins() {
				$(`.wrapper:nth-of-type(${this.colNumber()}n)`).css('margin-left', '0');
				$(`.wrapper:nth-of-type(${this.colNumber()}n + 1)`).css('margin-right', getRightMarginPercent(this.colNumber()));
			},
			selectWrapper(idx) {
				$('.selected').removeClass('selected');
				let $wrapper = this.wrappers(idx);

				if (empty($wrapper)) {
					$wrapper = this.wrappers(0);
				}

				$wrapper.addClass('selected');
			},
			renderNextPage() {
				this.renderPageNumber(this.currentPageNumber + 1);
			},
			renderPrevPage() {
				this.renderPageNumber(this.currentPageNumber - 1);
			},
			lastPage() {
				return this.currentPageNumber === this.resultsManager.nOfPages() - 1;
			},
			firstPage() {
				return this.currentPageNumber === 0;
			},
			navigate(idx, direction) {
				let navNextIdxAndPage = this.navigationManager.nextIdxAndPage(idx, direction);
				let nextIdx = navNextIdxAndPage.nextIdx;

				switch (navNextIdxAndPage.page) {
					case 'next':
						this.goToNextPage(nextIdx);
						break;
					case 'prev':
						this.goToPrevPage(nextIdx);
						break;
					default:
						this.selectWrapper(nextIdx);
				}
			},
			goToNextPage(nextIdx) {
				if (this.lastPage()) {
					if (this.searchOver()) return;

					this.queryAndDisplayNextPage(nextIdx);
					return;
				}

				this.renderPageAndSelectWrapper('next', nextIdx);
			},
			goToPrevPage(nextIdx) {
				if (this.firstPage()) return;

				this.renderPageAndSelectWrapper('prev', nextIdx);
			},
			queryAndDisplayNextPage(nextIdx) {
				let gazeActive = !this.onGazeBreak();

				if (gazeActive) {
					this.startGazeBreak();
				}

				this.getMoreResults()
						.then(() => {
							this.renderPageAndSelectWrapper('next', nextIdx);

							if (gazeActive) {
								this.endGazeBreak();
							}
						})
						.fail(() => this.alertFailure());
			},
			renderPageAndSelectWrapper(page, idx) {
				page === 'next' ? this.renderNextPage() : this.renderPrevPage();

				this.selectWrapper(idx);
			},
			wrappers(n) {
				let $wrappers = $('.wrapper');

				return n === undefined ? $wrappers : $wrappers.eq(n);
			},
			startVideo($wrapper, vidId) {
				vidId = vidId || $wrapper.find('figure').data('vid_id');

				if (this.openInYoutube()) {
					this.startVidInYoutube(vidId);
					return;
				}

				togglePlayerContent(true);
				if (this.showControls()) {
					this.renderPlayControls();
				}

				this.playVidWhenPlayerReady(vidId);
				this.checkStartGazeBreak();
			},
			startVidFromParams() {
				this.startVideo(null, this.query);
			},
			startVidInYoutube(vidId) {
				window.open(PLAY_IN_YT_URL + vidId);
			},
			playVidWhenPlayerReady(vidId) {
				setTimeout(() => {
					if (playerReady) {
						if (this.firstVideo()) {
							this.assignPlayer();
						}

						this.playerManager.playVid(vidId);
						return;
					}

					this.playVidWhenPlayerReady();
				}, 1500);
			},
			closePlayer() {
				if (this.playerManager.videoPlaying()) {
					this.playerManager.stopVid();
				}

				togglePlayerContent(false);
				this.renderNavControls();
			},
			assignPlayer() {
				this.playerManager = playerManager;
			},
			gazeGeneric($elm) {
				this.countdownAnimate($elm);
				this.clickWithDelay($elm);
			},
			gazeSelect($wrapper) {
				let selectDelay = this.gaSelectTime();
				let wrapperIdx = $wrapper.index();

				timeoutVar = setTimeout(() => {
					this.selectWrapper(wrapperIdx);
					this.gazeGeneric($wrapper);
				}, selectDelay);
			},
			clickWithDelay($elm) {
				let clickDelay = this.gaClickTime();
				timeoutVar = setTimeout(() => {
					$elm.get(0).click();

					this.removeProgressCircle();
					$elm.removeClass('clickable');
					setTimeout(() => $elm.addClass('clickable'), 1000);
				}, clickDelay );
			},
			// pauseGaForBuffer() {
			// 	this.startGazeBreak();

			// 	if (!this.gaRestMode()) {
			// 		setTimeout(this.endGazeBreak.bind(this), 1000);
			// 	}
			// },
			cancelGazeAction() {
				clearInterval(timeoutVar);
				this.removeProgressCircle();
			},
			countdownAnimate($elm) {
				if (activeAnimation($elm)) return;

				this.setCSSCircleWidth($elm);
				this.createProgCricleOn($elm)
			},
			createProgCricleOn($elm) {
				let $circle = $('<div>').addClass('progress_circle');
				$elm.append($circle);
				$circle.addClass('countdown_fill');
			},
			setCSSCircleWidth($elm) {
				let elmHeight = $elm.css('height');
				let circleWidth = parseInt(elmHeight, 10) / 2.5;

				circleWidth = circleWidth < 40 ? 40 : circleWidth;

				document.body.style.setProperty('--circleRadius', `${circleWidth}px`);
			},
			removeProgressCircle() {
				$('.progress_circle').stop(true, false).remove();
			},
			respondToNavKey(key) {
				let $selected = $('.selected');
				let selectedIdx = $selected.index();

				switch (key) {
					case 'enter':
						this.startVideo($selected);
						break;
					case 'home':
						this.goHome();
						break;
					case 'g':
						if (this.gaDisabled()) return;

						this.startGazeBreak();
						break;
					case 'o':
						if (this.gaDisabled()) return;

						this.endGazeBreak();
						break;
					default:
						this.navigate(selectedIdx, key);
				}
			},
			respondToPlayKey(key) {
				switch(key) {
					case 'escape':
						this.escapePlayProtocol();
						break;
					case 'y':
						this.yPlayProtocol();
						break;
					case 'r':
						this.rPlayProtocol();
						break
					default:
						this.playerManager.keyHandler(key);
				}
			},
			yPlayProtocol() {
				if (this.playerManager.videoNotStarting()) {
					let vidId = this.playerManager.getVidId();
					this.startVidInYoutube(vidId);
				}
			},
			rPlayProtocol() {
				if (this.playerManager.videoStopped()) {
					let vidId = this.playerManager.getVidId();
					this.goToRelatedVideosPage(vidId);
				}
			},
			goHome() {
				window.location.href = '/search';
			},
			goToRelatedVideosPage(id) {
				window.location.href = RELATED_VIDS_PAGE_URL + id;
			},
			escapePlayProtocol() {
				this.closePlayer();

				if (this.directPlay()) {
					this.goHome();
				}
			},
			alertFailure() {
				alert(ERROR_MSG);
			},
			toggleGaBreakButton() {
				let $button = $('#ga_break_toggle');
				let onBreak = this.onGazeBreak();

				if (this.gaRestMode()) {
					this.restModeGAButtonToggle($button, onBreak);
					return;
				}

				this.gaButtonToggle($button, onBreak);
			},
			restModeGAButtonToggle($button, onBreak) {
				let $buttonP = $button.find('p');

				if (onBreak) {
					$buttonP.text('לא לראות');
					$button.addClass('active');
					return;
				}

				$buttonP.text('לראות');
				$button.removeClass('active');
			},
			gaButtonToggle($button, onBreak) {
				let $buttonP = $button.find('p');

				if (onBreak) {
					$buttonP.text('התחל מצב מנוחה');
					$button.removeClass('active');
					return;
				}

				$buttonP.text('הפסק מצב מנוחה');
				$button.addClass('active');
			},
			startGazeBreak() {
				if (this.gazeBreak === true) return;

				if (this.showControls()) {
					this.toggleGaBreakButton();
				}

				this.gazeBreak = true;
			},
			endGazeBreak() {
				if (this.gazeBreak === false) return;
				if (this.showControls()) {
					this.toggleGaBreakButton();
				}
				
				this.gazeBreak = false;

			},
			searchOver() {
				return this.resultsManager.outOfQuota() || this.resultsManager.noMoreResults();
			},
			gaInactive() {
				return this.gaDisabled() || this.onGazeBreak();
			},
			firstVideo() {
				return this.playerManager === null;
			},
			playMode() {
				return $playerContainer.is(':visible');
			},
			onGazeBreak() {
				return this.gazeBreak;
			},
			vidsPerPage() {
				return this.colNumber() * this.rowNumber();
			},
			gaDisabled() {
				return this.userSettings['gaze_aware'] === 'off';
			},
			searchEmbeddable() {
				return this.userSettings['open_in_youtube'] === 'off';
			},
			colNumber() {
				return this.userSettings['col_number'];
			},
			rowNumber() {
				return this.userSettings['row_number'];
			},
			gaClickTime() {
				return this.userSettings['click_delay'] * 100;
			},
			gaSelectTime() {
				return this.userSettings['select_delay'] * 100;
			},
			backgroundColor() {
				return this.userSettings['background_color'];
			},
			chooserColor() {
				return this.userSettings['select_color'];
			},
			controlsWidth() {
				return this.userSettings['controls_width'];
			},
			controlsFloat() {
				return this.userSettings['controls_location'];
			},
			gaRestMode() {
				return this.userSettings['gaze_aware_rest'] === 'on';
			},
			openInYoutube() {
				let settings = this.userSettings;
				return settings ? settings['open_in_youtube'] === 'on' : false;
			},
			showControls() {
				return this.userSettings['show_controls'] === 'on';
			},
		};
	})();

	Object.create(Page).init();
});