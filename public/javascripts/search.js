$(() => {
	feather.replace()
	$searchBar = $('[type="text"]');
	$searchBar.focus();

	$('button').on('click', function(e) {
		if ($searchBar.val().match(/^[ ]*$/)) {
			e.preventDefault();
		}
	});
});