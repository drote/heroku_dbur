$(function() {
	Handlebars.registerPartial('imagePartial', $('#image_partial').html());

	$fields = $('#fields');

	const QUERY_STRINGS = {
		playlist: 'q_type=playlist_info&max_results=1&q_param=',
		channel: 'q_type=chan_info&max_results=1&q_param=',
		video: 'q_type=vid_info&max_results=1&q_param=',
		search: 'q_type=search&max_results=5&thumb_size=medium&search_embeddable=any&q_param=',
	}

	const HREF = {
		playlist: '/results?listId=',
		channel: '/results?chanId=',
		video: '/results?vidId=',
		search: '/results?query=',
	}

	const RESOUCE_SELECTION_TEXT = {
		search: 'חיפוש',
		playlist: 'הדבק לינק לרשימה',
		channel: 'הדבק לינק לערוץ',
		video: 'הדבק לינק לסרטון',
	}

	const getResourceId = (resource, type) => {
		switch (type) {
			case 'playlist':
				return resource.split('list=')[1];
			case 'channel':
				return resource.split('/channel/')[1];
			case 'video':
				return resource.split('?v=')[1];
			default:
				return resource;
		}
	}

	const vidsToImages = (vid) => vid.snippet.thumbnails.medium.url;

	const aClick = function(e) {
		e.preventDefault();

		this.type = $(e.target).data('type');
		this.renderResourceSelection();
	}

	const selectResourceClick = function(e) {
		e.preventDefault();

		let resource = $('input').val();

		this.dealWithResource(resource);
	}

	const imgSelectorUp = function(e) {
		$currentImg = $(e.target).siblings('div').find('img:visible');
		$next = $currentImg.prev();

		if ($next.length === 0) {
			$next = $currentImg.parent().find('img').last();
		}

		$currentImg.hide();
		$next.show();
	}
;
	const imgSelectorDown = function(e) {
		$currentImg = $(e.target).siblings('div').find('img:visible');
		$next = $currentImg.next();

		if ($next.length === 0) {
			$next = $currentImg.parent().find('img').first();
		}

		$currentImg.hide();
		$next.show();
	}

	const selectImgClick = function(e) {
		e.preventDefault();

		selected = $(e.target).siblings('div').find('img:visible').attr('src');

		this.logSearchToExport(selected);
		this.saveAndPreview();
	}

	const resource = {
		exportObj: {},
		templates: {},

		init() {
			this.getTemplates();
			this.bindEvents();
			this.displayHome();
			this.getIds();
		},
		getTemplates() {
			let that = this;

			$('[type="text/handlebars-x"]').each(function() {
				let tempName = $(this).attr('id').replace('_template', '');

				that.templates[tempName] = Handlebars.compile($(this).html());
			});
		},
		bindEvents() {
			$(document.body).on('click', '.type', aClick.bind(this))
			$(document.body).on('click', '#select_resource', selectResourceClick.bind(this));
			$(document.body).on('click', '.feather-chevron-up', imgSelectorUp);
			$(document.body).on('click', '.feather-chevron-down', imgSelectorDown);
			$(document.body).on('click', '#select_img', selectImgClick.bind(this));	
		},
		displayHome() {
			let html = this.templates.type_selection();
			$fields.html(html);
		},
		getIds() {
			this.userId = $('#user_id').html();
			this.resourceIdx = $('#resource_idx').html();
			this.exportObj.id = this.resourceIdx;

			$wrapper = $(`#wrapper_undefined`, window.parent.document);
			$wrapper.attr('id', `wrapper_${this.resourceIdx}`);
		},
		renderResourceSelection() {
			let label = RESOUCE_SELECTION_TEXT[this.type];
			let html = this.templates.resource_selection({ label });
			$fields.html(html);
		},
		dealWithResource(resource) {
			let resourceId = getResourceId(resource, this.type);

			this.checkValidiyGetImage(resourceId)
					.then(() => {
						this.exportObj.href = HREF[this.type] + resourceId;

						if (this.type !== 'search') {
							this.saveAndPreview();
						}
					})
					.fail(() => alert('הלינק המבוקש אינו תקין'));
		},
		logSearchToExport(img) {
			this.exportObj['img'] = img;
			this.exportObj['title'] = this.searchQuery;
		},
		checkValidiyGetImage(resourceId) {
			let queryString = QUERY_STRINGS[this.type] + resourceId;
			let that = this;

			return $.ajax({
				url: '/youtube_resource',
				data: queryString,
				dataType: 'json',
			}).then(function(response) {
				if (response.items.length === 0) {
					return Promise.reject();
				} else if (that.type === 'search') {
					that.renderImageSelector(response.items.map(vidsToImages), resourceId);
					return;
				}

				that.logToExport(response.items[0]);
			});
		},
		saveAndPreview() {
			let url = `/api/user_feed/${this.userId}`
			let wrapperId = this.resourceIdx;
			let method = 'post';

			if (window.location.href.split('/').includes('edit_resource')) {
				url = `/api/user_feed/${this.userId}/${this.resourceIdx}`;
				method = 'put';
			}


			return $.ajax({
				url,
				data: this.exportObj,
				method,
			}).done(function(response) {
				$wrapper = $(`#wrapper_${wrapperId}`, window.parent.document);
				$wrapper.replaceWith($(response));
			});
		},
		logToExport(item) {
			this.exportObj.title = item.snippet.title;
			this.exportObj.img = item.snippet.thumbnails.medium.url;
		},
		renderImageSelector(images, query) {
			this.searchQuery = query;
			let html = this.templates.image_selector({ images });
			$fields.html(html);
			feather.replace();
		},
	};

	Object.create(resource).init();
})