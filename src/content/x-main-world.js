// Runs in x.com's own JavaScript world (manifest "world": "MAIN").
// It only watches for x.com's AboutAccountQuery requests, which x.com makes when
// you open someone's "About this account" page, and passes the query id and
// the "Account based in" answer to the content script. Nothing else is read.
(() => {
  const QUERY = /\/graphql\/([\w-]+)\/AboutAccountQuery/;
  const post = (data) => window.postMessage({ source: 'deslop-main', ...data }, location.origin);

  const report = (text) => {
    try {
      const result = JSON.parse(text)?.data?.user_result_by_screen_name?.result;
      const screenName = result?.core?.screen_name;
      if (screenName) post({ type: 'about-result', screenName, basedIn: result.about_profile?.account_based_in || null });
    } catch {
      // Not JSON; ignore.
    }
  };

  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    const promise = nativeFetch.apply(this, arguments);
    const url = typeof input === 'string' ? input : input?.url || input?.href || '';
    const m = QUERY.exec(url);
    if (m) {
      post({ type: 'about-query-id', id: m[1] });
      promise.then((r) => r.clone().text()).then(report, () => {});
    }
    return promise;
  };

  const nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    const m = typeof url === 'string' ? QUERY.exec(url) : null;
    if (m) {
      post({ type: 'about-query-id', id: m[1] });
      this.addEventListener('load', () => {
        if (this.responseType === '' || this.responseType === 'text') report(this.responseText);
        else if (this.responseType === 'json') report(JSON.stringify(this.response));
      });
    }
    return nativeOpen.apply(this, arguments);
  };
})();
