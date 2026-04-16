// Read the _csrf cookie and attach it as X-CSRF-Token header on all fetch() calls
(function() {
  var origFetch = window.fetch;
  window.fetch = function(url, opts) {
    opts = opts || {};
    if (opts.method && opts.method !== 'GET' && opts.method !== 'HEAD') {
      opts.headers = opts.headers || {};
      if (opts.headers instanceof Headers) {
        if (!opts.headers.has('X-CSRF-Token')) {
          opts.headers.set('X-CSRF-Token', getCsrf());
        }
      } else {
        if (!opts.headers['X-CSRF-Token']) {
          opts.headers['X-CSRF-Token'] = getCsrf();
        }
      }
    }
    return origFetch.call(this, url, opts);
  };

  function getCsrf() {
    var m = document.cookie.match(/(^|;\s*)_csrf=([^;]+)/);
    return m ? m[2] : '';
  }
})();
