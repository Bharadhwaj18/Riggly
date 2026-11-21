// iPhone/iPad Safari zooms the page into any text field under 16px when it's focused, and doesn't zoom back out.
// Chrome doesn't. Adding maximum-scale=1 on iOS only stops that auto-zoom; iOS still lets people pinch-zoom
// (it ignores maximum-scale for gestures), so nothing is lost there. Android is left alone, since there it would
// block pinch-zoom. The server already sends this for iOS (generateViewport in src/app/layout.tsx); this script
// catches iPads that report themselves as a Mac, which the server can't tell apart.
export const IOS_VIEWPORT_SCRIPT = `(function(){try{var ua=navigator.userAgent;var ios=/iP(hone|ad|od)/.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);if(!ios)return;var fix=function(){var m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';m.content='width=device-width, initial-scale=1';document.head.appendChild(m)}if(m.content.indexOf('maximum-scale')<0)m.content+=', maximum-scale=1'};fix();document.addEventListener('DOMContentLoaded',fix);document.addEventListener('focusin',fix,true)}catch(e){}})()`

/** iPhone, iPad or iPod by user agent (iPads in desktop mode say Macintosh and are caught by the script instead). */
export const isIOS = (ua: string) => /iP(hone|ad|od)/.test(ua)
