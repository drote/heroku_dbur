let params = {};
const code = $('#code').html();
const client_id = $('#client_id').html();
const client_secret = $('#client_secret').html();

$('[type="var"]').remove();

feather.replace();

query = {
	code,
	client_id,
	client_secret,
	redirect_uri: 'http://localhost:4567/yt_connect',
	grant_type: 'authorization_code',
}

$.ajax({
	method: 'post',
	url: 'http://accounts.google.com/o/oauth2/token',
	data: query,
}).done(function(response) {
	console.log(response);
})