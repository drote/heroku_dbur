let playerManager;
let playerReady;
let player;

let tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";

let firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

const PlayerManager = (function() {
	const LOCATION_CHANGE_SEC = 10;
	const VOLUME_CHANGE_PCENT = 5;
	const VIDSTAT_UNSTARTED = -1;
	const VIDSTAT_ENDED = 0;
	const VIDSTAT_PLAYING = 1;
	const VIDSTAT_PAUSED = 2;
	const VIDSTAT_CUED = 5;

	const keyToAction = {
		f() {
			this.toggleFullScreen();
		},
		k() {
			this.togglePlay();
		},
		spacebar() {
			this.togglePlay();
		},
		m() {
			this.toggleMute();
		},
		left() {
			this.changeLocation(-LOCATION_CHANGE_SEC);
		},
		right() {
			this.changeLocation(LOCATION_CHANGE_SEC);
		},
		up() {
			this.changeVolume(VOLUME_CHANGE_PCENT);
		},
		down() {
			this.changeVolume(-VOLUME_CHANGE_PCENT);
		},
		enter() {
			return
		},
	}

	const requestFullscreen = (container) => {
		let func =  container.requestFullscreen
							  || container.webkitRequestFullScreen
							  || container.mozRequestFullScreen
							  || container.msRequestFullscreen;

		func.call(container);
	}

	const cancelFullscreen = () => {
		let func = document.webkitExitFullscreen
							 || document.mozCancelFullScreen
		 					 || document.msExitFullscreen
		 					 || document.exitFullscreen;

		func.call(document);
	}

	const isFullScreen = () => {
		return document.mozFullScreenElement
				   || document.msFullscreenElement
				   || document.webkitFullscreenElement;
	}

	const zeroToHundred = (n) => {
		if (n > 100) {
			n = 100;
		} else if (n < 0) {
			n = 0;
		}

		return n;
	}

  return {
		init() {
			player = new YT.Player('player', {
			  playerVars: {
			  	controls: '0',
			  },
			  events: {
			  	onReady: function() {
			  		playerReady = true;
			  	},
			  	onStateChange: function(player) {
			  		$playButton = $('#play_toggle');
			  		$relatedButton = $('#related_videos');

			  		if ($playButton.length === 0) return;

			  		switch (player.data) {
			  			case VIDSTAT_PLAYING:
			  				$playButton.addClass('playing');
			  				$playButton.find('p').text('הפסק');
			  				$relatedButton.removeClass('clickable');
			  				break;
			  			default:
			  				$playButton.removeClass('playing');
			  				$playButton.find('p').text('נגן');
			  				$relatedButton.addClass('clickable');
			  		}
			  	},
			  },
			});

			return this;
		},
		toggleFullScreen() {
			let playerContainer = $('#player_container').get(0);

			if (isFullScreen()) {
				cancelFullscreen();
				return;
			}

			requestFullscreen(playerContainer);
		},
		togglePlay() {
			if (this.videoPlaying()) {
				player.pauseVideo();
			} else if (this.videoStopped()) {
				player.playVideo();
			}
		},
		changeVolume(change) {
			let newVolume = player.getVolume() + change;

			player.setVolume(zeroToHundred(newVolume));
		},
		toggleMute() {
			player.isMuted() ? player.unMute() : player.mute();
		},
		playVid(vidId) {
			player.loadVideoById(vidId);
		},
		stopVid() {
			player.stopVideo();
		},
		changeLocation(change) {
			let newTime = player.getCurrentTime() + change;

			player.seekTo(newTime);
		},
		keyHandler(key) {
			keyToAction[key].call(this);
		},
		getVidId() {
			return player.getVideoData()['video_id'];
		},
		videoNotStarting() {
			return player.getPlayerState() === VIDSTAT_UNSTARTED;
		},
		videoStopped() {
			let vidState = player.getPlayerState();
			
			return vidState === VIDSTAT_PAUSED 
						|| vidState === VIDSTAT_ENDED
						|| vidState === VIDSTAT_CUED; 
		},
		videoPlaying() {
			return player.getPlayerState() === VIDSTAT_PLAYING;
		},
		playControlExists() {
			return $('#play_toggle').length !== 0;
		},
	}
})();

function onYouTubeIframeAPIReady() {
	playerManager = Object.create(PlayerManager).init();
}
