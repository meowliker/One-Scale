import { NextRequest, NextResponse } from 'next/server';

function buildPixelScript(pixelId: string) {
  // Tiny first-party tracker:
  // - stores click identifiers
  // - emits PageView automatically
  // - exposes tw('track', eventName, props)
  return `
(function(){
  if (window.tw && window.tw.__loaded) return;
  var PIXEL_ID = ${JSON.stringify(pixelId)};
  var SESSION_KEY = 'tw_session_id';
  var CLICK_KEY = 'tw_click_id';
  var ATTR_KEY = 'tw_attr_v2';
  var FIRST_ATTR_KEY = 'tw_attr_first_v1';
  var CART_SYNC_KEY = 'tw_cart_sync_v2';
  var FBP_KEY = '_fbp';
  var FBC_KEY = '_fbc';
  var SCRIPT_ORIGIN = null;

  try {
    if (document.currentScript && document.currentScript.src) {
      SCRIPT_ORIGIN = new URL(document.currentScript.src).origin;
    } else {
      var scripts = document.getElementsByTagName('script');
      for (var i = scripts.length - 1; i >= 0; i--) {
        var src = scripts[i] && scripts[i].src;
        if (src && src.indexOf('/api/tracking/pixel') !== -1) {
          SCRIPT_ORIGIN = new URL(src).origin;
          break;
        }
      }
    }
  } catch (_) {}

  var COLLECT_URL = (SCRIPT_ORIGIN || window.location.origin) + '/api/tracking/collect';

  function uid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getOrCreate(key) {
    try {
      var v = localStorage.getItem(key);
      if (!v) {
        v = uid();
        localStorage.setItem(key, v);
      }
      return v;
    } catch (_) {
      return uid();
    }
  }

  function getParam(name) {
    try {
      return new URL(window.location.href).searchParams.get(name);
    } catch (_) {
      return null;
    }
  }

  function decodeValue(v) {
    if (!v) return null;
    try { return decodeURIComponent(v); } catch (_) { return v; }
  }

  function readCookie(name) {
    try {
      var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()\\[\\]\\\\/+^]/g, '\\\\$&') + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch (_) {
      return null;
    }
  }

  function readAttrs(key) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (_) {
      return {};
    }
  }

  function writeAttrs(key, next) {
    try { localStorage.setItem(key, JSON.stringify(next || {})); } catch (_) {}
  }

  function firstValue() {
    for (var i = 0; i < arguments.length; i++) {
      var value = arguments[i];
      if (typeof value === 'string' && value.trim().length > 0) return value.trim();
      if (typeof value === 'number' && isFinite(value)) return String(value);
    }
    return null;
  }

  function resolveAttribution() {
    var existingLast = readAttrs(ATTR_KEY);
    var existingFirst = readAttrs(FIRST_ATTR_KEY);
    var clickFromStorage = null;
    try { clickFromStorage = localStorage.getItem(CLICK_KEY); } catch (_) {}

    var clickIdFromUrl = getParam('fbclid');
    var campaignIdFromUrl = firstValue(
      getParam('campaign_id'),
      getParam('campaignid'),
      getParam('fb_campaign_id'),
      getParam('utm_campaign_id'),
      getParam('hsa_cam')
    );
    var adSetIdFromUrl = firstValue(
      getParam('adset_id'),
      getParam('adsetid'),
      getParam('fb_adset_id'),
      getParam('utm_adset_id'),
      getParam('hsa_adset')
    );
    var adIdFromUrl = firstValue(
      getParam('ad_id'),
      getParam('adid'),
      getParam('fb_ad_id'),
      getParam('utm_ad_id'),
      getParam('hsa_ad')
    );
    var utmCampaign = firstValue(getParam('utm_campaign'));
    var utmMedium = firstValue(getParam('utm_medium'));
    var utmContent = firstValue(getParam('utm_content'));

    if (utmCampaign) utmCampaign = decodeValue(utmCampaign);
    if (utmMedium) utmMedium = decodeValue(utmMedium);
    if (utmContent) utmContent = decodeValue(utmContent);

    var last = {
      clickId: firstValue(clickIdFromUrl, existingLast.clickId, clickFromStorage, existingFirst.clickId),
      campaignId: firstValue(campaignIdFromUrl, existingLast.campaignId, existingFirst.campaignId),
      adSetId: firstValue(adSetIdFromUrl, existingLast.adSetId, existingFirst.adSetId),
      adId: firstValue(adIdFromUrl, existingLast.adId, existingFirst.adId),
      utmCampaign: firstValue(utmCampaign, existingLast.utmCampaign, existingFirst.utmCampaign),
      utmMedium: firstValue(utmMedium, existingLast.utmMedium, existingFirst.utmMedium),
      utmContent: firstValue(utmContent, existingLast.utmContent, existingFirst.utmContent)
    };
    var first = {
      clickId: firstValue(existingFirst.clickId, clickIdFromUrl, existingLast.clickId, clickFromStorage),
      campaignId: firstValue(existingFirst.campaignId, campaignIdFromUrl, existingLast.campaignId),
      adSetId: firstValue(existingFirst.adSetId, adSetIdFromUrl, existingLast.adSetId),
      adId: firstValue(existingFirst.adId, adIdFromUrl, existingLast.adId),
      utmCampaign: firstValue(existingFirst.utmCampaign, utmCampaign, existingLast.utmCampaign),
      utmMedium: firstValue(existingFirst.utmMedium, utmMedium, existingLast.utmMedium),
      utmContent: firstValue(existingFirst.utmContent, utmContent, existingLast.utmContent)
    };

    if (last.clickId) {
      try { localStorage.setItem(CLICK_KEY, last.clickId); } catch (_) {}
    }
    writeAttrs(ATTR_KEY, last);
    writeAttrs(FIRST_ATTR_KEY, first);
    return { last: last, first: first };
  }

  function buildFbc(clickId) {
    if (!clickId) return null;
    return 'fb.1.' + Math.floor(Date.now() / 1000) + '.' + clickId;
  }

  function syncCartAttribution(attribution, fbp, fbc) {
    // Shopify cart attributes get copied into order.note_attributes at checkout.
    // This is the core mechanism used to map Shopify orders back to ads.
    if (!window.location || !window.location.hostname) return;
    var isShopifyStore = window.location.hostname.indexOf('myshopify.com') !== -1 || window.Shopify;
    if (!isShopifyStore) return;
    var attrs = attribution && attribution.last ? attribution.last : {};
    var first = attribution && attribution.first ? attribution.first : {};

    var payload = {
      attributes: {
        _tw_click_id: attrs.clickId || '',
        _tw_fbp: fbp || '',
        _tw_fbc: fbc || '',
        _tw_campaign_id: attrs.campaignId || '',
        _tw_adset_id: attrs.adSetId || '',
        _tw_ad_id: attrs.adId || '',
        _tw_utm_campaign: attrs.utmCampaign || '',
        _tw_utm_medium: attrs.utmMedium || '',
        _tw_utm_content: attrs.utmContent || '',
        _tw_ft_click_id: first.clickId || '',
        _tw_ft_campaign_id: first.campaignId || '',
        _tw_ft_adset_id: first.adSetId || '',
        _tw_ft_ad_id: first.adId || '',
        _tw_ft_utm_campaign: first.utmCampaign || '',
        _tw_ft_utm_medium: first.utmMedium || '',
        _tw_ft_utm_content: first.utmContent || '',
        _tw_first_click_id: first.clickId || '',
        _tw_first_campaign_id: first.campaignId || '',
        _tw_first_adset_id: first.adSetId || '',
        _tw_first_ad_id: first.adId || '',
        _tw_first_utm_campaign: first.utmCampaign || '',
        _tw_first_utm_medium: first.utmMedium || '',
        _tw_first_utm_content: first.utmContent || ''
      }
    };
    var signature = JSON.stringify(payload.attributes);
    try {
      if (localStorage.getItem(CART_SYNC_KEY) === signature) return;
    } catch (_) {}

    fetch('/cart/update.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    }).then(function(){
      try { localStorage.setItem(CART_SYNC_KEY, signature); } catch (_) {}
    }).catch(function(){});
  }

  function send(eventName, props) {
    props = props || {};
    var attribution = resolveAttribution();
    var attrs = attribution.last || {};
    var first = attribution.first || {};
    var fbp = readCookie(FBP_KEY);
    var fbc = readCookie(FBC_KEY) || buildFbc(attrs.clickId);
    syncCartAttribution(attribution, fbp, fbc);
    var body = {
      pixelId: PIXEL_ID,
      eventName: eventName,
      source: 'browser',
      eventTime: new Date().toISOString(),
      pageUrl: window.location.href,
      referrer: document.referrer || null,
      sessionId: getOrCreate(SESSION_KEY),
      clickId: attrs.clickId,
      fbp: fbp,
      fbc: fbc,
      campaignId: attrs.campaignId,
      adSetId: attrs.adSetId,
      adId: attrs.adId,
      value: typeof props.value === 'number' ? props.value : undefined,
      currency: props.currency,
      orderId: props.orderId,
      user: props.user,
      properties: Object.assign({}, props, {
        utmCampaign: attrs.utmCampaign,
        utmMedium: attrs.utmMedium,
        utmContent: attrs.utmContent,
        campaignId: attrs.campaignId,
        adSetId: attrs.adSetId,
        adId: attrs.adId,
        firstTouchClickId: first.clickId,
        firstTouchCampaignId: first.campaignId,
        firstTouchAdSetId: first.adSetId,
        firstTouchAdId: first.adId,
        firstTouchUtmCampaign: first.utmCampaign,
        firstTouchUtmMedium: first.utmMedium,
        firstTouchUtmContent: first.utmContent,
      })
    };

    var payload = JSON.stringify(body);
    var url = COLLECT_URL;
    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
      return;
    }
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true
    }).catch(function(){});
  }

  resolveAttribution();

  function tw(cmd, arg1, arg2) {
    if (cmd === 'init') return;
    if (cmd === 'track') return send(arg1, arg2);
  }
  tw.__loaded = true;
  window.tw = tw;

  send('PageView', {});
})();`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const pixelId = searchParams.get('pixel') || searchParams.get('pixelId');
  if (!pixelId) {
    return new NextResponse('/* missing pixel */', {
      status: 400,
      headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
    });
  }

  return new NextResponse(buildPixelScript(pixelId), {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
