/**
 * Generates vanilla JS pixel snippets for Shopify theme installation.
 *
 * Main snippet:  install in Shopify theme → Snippets → onescale-pixel
 *                then add {% render 'onescale-pixel' %} before </body>
 *
 * Checkout snippet: install in Shopify Admin → Settings → Checkout
 *                   → Order status page → Additional scripts
 *
 * v2: Captures product_id on product pages (view_content) and add-to-cart events.
 */

export function generatePixelSnippet(storeId: string, baseUrl: string): string {
  return `<!-- OneScale Attribution Pixel v2 -->
<script>
(function(){
  'use strict';
  var SID=${JSON.stringify(storeId)};
  var EP=${JSON.stringify(baseUrl + '/api/pixel/event')};
  var DAYS=30, SESS=30;

  function gc(n){var m=document.cookie.match(new RegExp('(^| )'+n+'=([^;]+)'));return m?decodeURIComponent(m[2]):null;}
  function sc(n,v,d){document.cookie=n+'='+encodeURIComponent(v)+';expires='+new Date(Date.now()+d*864e5).toUTCString()+';path=/;SameSite=Lax';}
  function gp(n){return new URLSearchParams(window.location.search).get(n);}

  function vid(){var id=gc('_os_vid');if(!id){id='osv_'+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);sc('_os_vid',id,DAYS);}return id;}
  function sid(){var id=gc('_os_sid'),la=parseInt(gc('_os_sla')||'0',10),now=Date.now();if(!id||(now-la)>SESS*6e4){id='oss_'+Math.random().toString(36).slice(2);sc('_os_sid',id,1);}sc('_os_sla',String(now),1);return id;}

  function fbc(){var f=gp('fbclid');if(f){var v='fb.1.'+Date.now()+'.'+f;sc('_fbc',v,DAYS);sc('_os_fbclid',f,DAYS);}return gc('_fbc')||gc('_os_fbclid');}
  function utms(){var r={};['utm_source','utm_medium','utm_campaign','utm_content','utm_term'].forEach(function(k){var v=gp(k);if(v){r[k]=v;sc('_os_'+k,v,DAYS);}else{var s=gc('_os_'+k);if(s)r[k]=s;}});return r;}

  function dp(){
    var r={id:null,title:null,variant:null};
    try{
      if(window.meta&&window.meta.product){
        r.id=String(window.meta.product.id);
        if(window.meta.product.variants&&window.meta.product.variants[0])
          r.variant=String(window.meta.product.variants[0].id);
      }
      else if(window.ShopifyAnalytics&&window.ShopifyAnalytics.meta&&window.ShopifyAnalytics.meta.product){
        r.id=String(window.ShopifyAnalytics.meta.product.id);
      }
      if(r.id){
        var t=document.querySelector('meta[property="og:title"]');
        r.title=t?t.getAttribute('content'):document.title.split('\\u2013')[0].split('|')[0].trim();
      }
    }catch(e){}
    return r.id?r:null;
  }

  function send(type,extra){
    var p=Object.assign({
      store_id:SID,visitor_id:vid(),session_id:sid(),
      event_type:type,page_url:window.location.href,
      referrer:document.referrer||null,
      fbclid:gp('fbclid')||gc('_os_fbclid')||null,
      gclid:gp('gclid')||null,
      ttclid:gp('ttclid')||null,
      _fbc:fbc()||null,_fbp:gc('_fbp')||null,
      user_agent:navigator.userAgent,
    },utms(),extra||{});
    var b=JSON.stringify(p);
    if(navigator.sendBeacon){navigator.sendBeacon(EP,new Blob([b],{type:'application/json'}));}
    else{fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:b,keepalive:true}).catch(function(){});}
  }

  var prod=dp();
  if(prod){
    send('view_content',{product_id:prod.id,product_title:prod.title,variant_id:prod.variant});
  } else {
    send('page_view');
  }

  window.OneScalePixel={
    track:send,
    purchase:function(oid,val){send('purchase',{order_id:String(oid),order_value:parseFloat(val)||0});}
  };

  var of=window.fetch;
  window.fetch=function(u,o){
    if(typeof u==='string'&&u.includes('/cart/add')){
      try{
        var pid=null,vid2=null;
        if(o&&o.body){
          try{
            var d=JSON.parse(o.body);
            if(d.items&&d.items[0]){pid=String(d.items[0].product_id||'');vid2=String(d.items[0].id||d.items[0].variant_id||'');}
            else if(d.id){vid2=String(d.id);pid=String(d.product_id||'');}
          }catch(e){
            if(typeof o.body==='string'){var ps=new URLSearchParams(o.body);vid2=ps.get('id');pid=ps.get('product_id');}
          }
        }
        if(!pid&&prod)pid=prod.id;
        send('add_to_cart',{product_id:pid||null,variant_id:vid2||null});
      }catch(e){}
    }
    return of.apply(this,arguments);
  };
})();
</script>`;
}

export function generateCheckoutSnippet(storeId: string, baseUrl: string): string {
  return `<!-- OneScale Purchase Tracking v2 -->
<script>
(function(){
  var EP=${JSON.stringify(baseUrl + '/api/pixel/event')};
  var SID=${JSON.stringify(storeId)};
  function gc(n){var m=document.cookie.match(new RegExp('(^| )'+n+'=([^;]+)'));return m?decodeURIComponent(m[2]):null;}
  var p={
    store_id:SID,
    visitor_id:gc('_os_vid')||'unknown',
    session_id:gc('_os_sid')||'unknown',
    event_type:'purchase',
    order_id:'{{ order.id }}',
    order_value:parseFloat('{{ order.total_price | money_without_currency }}'.replace(/,/g,''))||0,
    page_url:window.location.href,
    fbclid:gc('_os_fbclid')||null,
    gclid:gc('_os_gclid')||null,
    ttclid:gc('_os_ttclid')||null,
    _fbc:gc('_fbc')||null,_fbp:gc('_fbp')||null,
    utm_source:gc('_os_utm_source')||null,
    utm_medium:gc('_os_utm_medium')||null,
    utm_campaign:gc('_os_utm_campaign')||null,
    utm_content:gc('_os_utm_content')||null,
    utm_term:gc('_os_utm_term')||null,
    user_agent:navigator.userAgent,
  };
  if(navigator.sendBeacon){navigator.sendBeacon(EP,new Blob([JSON.stringify(p)],{type:'application/json'}));}
  else{fetch(EP,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p),keepalive:true}).catch(function(){});}
})();
</script>`;
}
