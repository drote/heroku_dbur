const FAILURE_MSG = 'משהו לא הסתדר. אנא נסה שוב לאחר ריענון הדף.';
const USER_SETTINGS_URL = '/api/user_settings/';
const DEFAULT_SETTINGS_URL = '/api/default_user_settings'

$(function() {
	const $form = $('form');
	const $gazeAwareRadio = $('[name="gaze_aware"]');
	const $gazeAwareRadioRest = $('[name="gaze_aware_rest"]');
	const $openInYoutubeRadio = $('[name="open_in_youtube"]');
	const $selectSliderInput = $('#select_delay');
	const $clickSliderInput = $('#click_delay');
	const $controlsWidthSliderInput = $('#controls_width');
	const $sliderInputs = $('[type="range"]');
	const $sliderVals = $('.slider_value');
	const $clickSliderVal = $('#click_delay_span');
	const $selectSliderVal = $('#select_delay_span');
	const $rowNumberInput = $('#row_number');
	const $colNumberInput = $('#col_number');
	const $backgroundInput = $('[name="background_color"]');
	const $selectColorInput = $('[name="select_color"]');
	const $resetButton = $('[type="reset"]');
	const $controlsLocationRadio = $('[name="controls_location"]');
	const $showControlsRadio = $('[name=show_controls]');

	const Page = (function() {
		const formToJson = ($form) => {
			let json = {};
			let formData = $form.serializeArray();
			formData.forEach((pair) => json[pair['name']] = pair['value']);

			return (json);
		}

		const formSubmitHandler = function(e) {
			e.preventDefault();

			this.submitForm($form);
		}

		const sliderChangeHandler = function(e) {
			$slider = $(e.target);

			this.changeSliderNumberValue($slider);
		}

		const radioInputChange = function() {
			let toggleOn = $('[name="gaze_aware"]:checked').val() === 'on';

			this.toggleSlideBars(toggleOn);
			this.toggleGazeAwareRestRadios(toggleOn);
		}

		const resetForm = function(e) {
			e.preventDefault();

			this.resetForm();
		}

		return {
			init() {
				this.bindEvents();
				this.initForm();
				feather.replace();
			},
			bindEvents() {
				$form.on('submit', formSubmitHandler.bind(this));
				$sliderInputs.on('input', sliderChangeHandler.bind(this));
				$gazeAwareRadio.on('change', radioInputChange.bind(this));
				$resetButton.on('click', resetForm.bind(this));
			},
			initForm() {
				let settings;

				this.getUserSettings().then(function(response) {
					this.populateFormFields(response);
				});
			},
			getDefaultSettings() {
				return this.ajax(DEFAULT_SETTINGS_URL);
			},
			getUserSettings() {
				let userId = $form.data('id');
				return this.ajax(`${USER_SETTINGS_URL}${userId}`);
			},
			submitForm($form) {
				let method = $form.attr('method');
				let url = $form.attr('action');
				let data = formToJson($form);

				this.ajax(url, method, data)
						.then(function() {
							$('#logo').get(0).click();
						});
			},
			resetForm() {
				this.getDefaultSettings()
						.then(function(response) {
							this.populateFormFields(response);
						});
			},
			populateFormFields(response) {
				let settings = JSON.parse(response);

				this.setFormValues(settings);
			},
			ajax(url, method, data) {
				return $.ajax({
					method,
					url,
					data,
					context: this,
				});
			},
			redirect() {
				window.location.replace('/search');
			},
			changeSliderNumberValue($slider) {
				let sliderValId = $slider.attr('name');
				let $sliderVal = $(`#${sliderValId}_span`);
				let newVal = $slider.val();

				if (sliderValId !== 'controls_width') {
					newVal /= 10;
				}

				$sliderVal.text(newVal);
			},
			setFormValues(params) {
				let { gaze_aware, gaze_aware_rest, select_delay, click_delay,
								row_number, col_number, background_color, select_color,
								controls_width, controls_location, open_in_youtube, show_controls } = params;

				this.setRadioInput($gazeAwareRadio, gaze_aware);
				this.setRadioInput($controlsLocationRadio, controls_location);
				this.setRadioInput($gazeAwareRadioRest, gaze_aware_rest);
				this.setRadioInput($openInYoutubeRadio, open_in_youtube);
				this.setRadioInput($showControlsRadio, show_controls);
				this.setSliderValues(select_delay, click_delay, controls_width);
				this.setRowColValues(row_number, col_number);
				this.setColorInputs(background_color, select_color);
				this.toggleSlideBars(this.gaActive(gaze_aware));
				this.toggleGazeAwareRestRadios(this.gaActive(gaze_aware));
				this.setSliderNumValues();
			},
			gaActive(ga) {
				return ga === 'on';
			},
			toggleGazeAwareRestRadios(bool) {
				$gazeAwareRadioRest.prop('disabled', !bool);
			},
			toggleSlideBars(bool) {
				$selectSliderInput.prop('disabled', !bool);
				$clickSliderInput.prop('disabled', !bool);
				$selectSliderVal.toggle(bool);
				$clickSliderVal.toggle(bool);
			},
			setRadioInput($radios, radioVal = 'off') {
				$radios.each(function() {
					$radio = $(this);
					$radio.prop('checked', $radio.val() === radioVal);
				});
			},
			setRowColValues(rowN, colN) {
				$rowNumberInput.val(rowN);
				$colNumberInput.val(colN);
			},
			setSliderValues(selectDelay = 5, clickDelay = 15, controlsWidth) {
				$selectSliderInput.val(selectDelay);
				$clickSliderInput.val(clickDelay);
				$controlsWidthSliderInput.val(controlsWidth);
			},
			setSliderNumValues() {
				let that = this;

				$sliderInputs.each(function() {
					that.changeSliderNumberValue($(this));
				});
			},
			setColorInputs(bgColor, slctColor) {
				$backgroundInput.val(bgColor);
				$selectColorInput.val(slctColor);
			},
		};
	})();

	Object.create(Page).init();
});