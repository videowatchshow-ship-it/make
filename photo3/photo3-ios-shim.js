(function(){
  if(!window.visualViewport){
    window.visualViewport={
      width:window.innerWidth,height:window.innerHeight,scale:1,
      offsetLeft:0,offsetTop:0,pageLeft:0,pageTop:0,
      addEventListener:function(){},removeEventListener:function(){}
    };
  }
  window.addEventListener('error',function(e){
    console.warn('[p3shim]',e.message,e.filename,e.lineno);
  });
  window.addEventListener('unhandledrejection',function(e){
    console.warn('[p3shim-pr]',e.reason);
  });
  var _f=window.fetch;
  window.fetch=function(u,o){
    o=o||{};
    if(typeof u==='string'&&(/\.json(\?|$)/.test(u)||/\.php(\?|$)/.test(u))){
      o.cache='no-store';
      u+=((u.indexOf('?')>-1)?'&':'?')+'_t='+Date.now();
    }
    return _f.call(this,u,o);
  };
  var _x=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    if(typeof u==='string'&&(/\.json(\?|$)/.test(u)||/\.php(\?|$)/.test(u))){
      u+=((u.indexOf('?')>-1)?'&':'?')+'_t='+Date.now();
    }
    return _x.apply(this,arguments);
  };
})();
