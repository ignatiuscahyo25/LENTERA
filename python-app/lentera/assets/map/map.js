/* Map rendering only. Business logic and routing live in Python. */
let map, bridge, reports=[], selected=null, markers=[], start=null, startMarker=null, choosing=false;
let ready=false, pendingRoute=null, lastFocus=null;
let checkingTileError=false;
const notice=document.getElementById('notice');
function message(value){notice.textContent=value;notice.hidden=!value;if(bridge)bridge.message(value);}
function inside(p){return p[0]>=104.1394&&p[0]<=116.5814&&p[1]>=-9.541155&&p[1]<=-3.951935;}
function valid(r){return Number.isFinite(r.latitude)&&Number.isFinite(r.longitude)&&Math.abs(r.latitude)<=90&&Math.abs(r.longitude)<=180;}
function pin(color){const el=document.createElement('div');el.className='pin '+color;return el;}
function render(){
 if(!ready)return;
 markers.forEach(m=>m.remove());markers=[];
 const visible=selected===null?reports:reports.filter(r=>r.id===selected);
 let outside=0,missing=0;
 visible.forEach(r=>{
  if(!valid(r)){missing++;return;} const p=[r.longitude,r.latitude];if(!inside(p)){outside++;return;}
  const el=pin(String(r.status).toUpperCase());el.title=r.message_id+' · '+r.victim_count+' korban';
  el.addEventListener('click',()=>{if(bridge)bridge.reportSelected(r.id);});
  markers.push(new maplibregl.Marker({element:el}).setLngLat(p).addTo(map));
 });
 const current=visible.find(valid);
 if(selected!==lastFocus){
  resetRoute();lastFocus=selected;
  if(selected!==null&&current&&inside([current.longitude,current.latitude]))map.easeTo({center:[current.longitude,current.latitude],zoom:14});
  else if(selected===null)map.easeTo({center:[106.85,-6.25],zoom:9});
 }
 if(outside)message(outside+' laporan berada di luar cakupan peta Jawa.');
 else if(selected!==null&&missing)message('Koordinat korban belum tersedia.');
}
window.receiveState=function(value){reports=value.reports||[];selected=value.selected;render();};
window.resizeMap=function(){if(map)map.resize();};
window.chooseStart=function(){choosing=true;message('Klik titik keberangkatan tim SAR pada peta.');};
function resetRoute(){
 choosing=false;start=null;if(startMarker){startMarker.remove();startMarker=null;}
 if(map&&map.getLayer('route'))map.removeLayer('route');
 if(map&&map.getSource('route'))map.removeSource('route');
 if(bridge)bridge.startCleared();
}
window.resetRoute=resetRoute;
window.drawRoute=function(value){
 if(!ready){pendingRoute=value;return;}
 if(map.getLayer('route'))map.removeLayer('route');
 if(map.getSource('route'))map.removeSource('route');
 map.addSource('route',{type:'geojson',data:{type:'Feature',properties:{},geometry:value.geometry}});
 map.addLayer({id:'route',type:'line',source:'route',paint:{'line-color':'#236dc0','line-width':5}});
 const bounds=new maplibregl.LngLatBounds();value.geometry.coordinates.forEach(p=>bounds.extend(p));map.fitBounds(bounds,{padding:45});message('');
};
function boot(){
 try{
  if(typeof maplibregl==='undefined')throw Error('Aset MapLibre lokal belum tersedia.');
  map=new maplibregl.Map({container:'map',style:window.offlineStyle,center:[106.85,-6.25],zoom:9,minZoom:4,maxZoom:18,maxBounds:[[104.1394,-9.541155],[116.5814,-3.951935]]});
  map.addControl(new maplibregl.NavigationControl(),'top-right');
  // Style readiness does not depend on the presence of every offline tile.
  map.on('style.load',()=>{ready=true;message('');render();if(pendingRoute)window.drawRoute(pendingRoute);if(bridge)bridge.mapReady();});
  map.on('error',async()=>{
   if(checkingTileError)return;checkingTileError=true;
   try{
    const response=await fetch('/api/system');const status=await response.json();
    message(status.map&&!status.map.available?status.map.message:'Sebagian data peta gagal dimuat. Coba buka ulang peta atau periksa layanan lokal.');
   }catch(e){message('Layanan peta lokal tidak terhubung. Menunggu backend Python.');}
   finally{checkingTileError=false;}
  });
  map.on('webglcontextlost',()=>message('WebGL terganggu. Periksa driver GPU Raspberry Pi.'));
  map.on('click',e=>{
   if(!choosing)return;const p=[e.lngLat.lng,e.lngLat.lat];if(!inside(p)){message('Titik awal di luar cakupan Jawa.');return;}
   resetRoute();start=p;startMarker=new maplibregl.Marker({element:pin('start')}).setLngLat(p).addTo(map);choosing=false;
   if(bridge)bridge.startSelected(p[0],p[1]);message('Titik awal dipilih. Tekan Cari Rute Offline.');
  });
 }catch(e){message('Peta tidak dapat dimuat: '+e.message);}
}
if(typeof QWebChannel!=='undefined'&&typeof qt!=='undefined'){
 new QWebChannel(qt.webChannelTransport,c=>{bridge=c.objects.bridge;bridge.stateChanged.connect(s=>window.receiveState(JSON.parse(s)));boot();});
}else{message('Jembatan Qt tidak tersedia. Buka peta dari aplikasi desktop LENTERA.');}
