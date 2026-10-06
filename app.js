const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[c]));
const glyphs = {美食:"食",景觀:"山",公園:"森",建築:"街",市場:"市",博物館:"館",徒步區:"道",超市:"買",飯店:"宿",機場:"空",交通:"車",車站:"站"};
const readSet = (key) => { try { return new Set(JSON.parse(localStorage.getItem(key) || "[]")); } catch { return new Set(); } };
const state = {
  data:null, day:1, view:"itinerary", mode:"driving", group:"全部", search:"",
  done:readSet("hokkaido-done"), favorites:readSet("hokkaido-favorites")
};
const weatherState={records:null,updatedAt:null,error:null,loading:false};
const weatherCacheKey="hokkaido-weather-v2";
const weatherPeriods=[
  {id:"morning",label:"早上",time:"08:00"},
  {id:"noon",label:"中午",time:"13:00"},
  {id:"evening",label:"晚上",time:"19:00"}
];

function saveSet(key,set){localStorage.setItem(key,JSON.stringify([...set]));}
function toast(message){
  const target=$("#toast"); target.textContent=message; target.classList.add("show");
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>target.classList.remove("show"),2600);
}
function localToday(){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function pathFor(path){ return path ? "./"+path : ""; }
function imgStyle(place){return place.image ? `style="background-image:url('${esc(pathFor(place.image.path))}')"` : "";}
function imageBadge(image){return image?.representative?'<span class="photo-badge">區域參考照片</span>':"";}
function isReturnFlight(place){return place.name==="北海道 to 台灣";}
function timeRange(place){
  if(!place.time)return "時間未定";
  if(isReturnFlight(place))return `${place.time} 日本起飛${place.endTime?" → "+place.endTime+" 台灣抵達":""}`;
  return `${place.time}${place.endTime?"–"+place.endTime:""}`;
}
function dayPlaces(day){
  return state.data.places.filter(p=>p.day===day).sort((a,b)=>{
    if(!a.time)return 1;if(!b.time)return -1;
    return a.time.localeCompare(b.time) || a.name.localeCompare(b.name);
  });
}
function navigationUrl(query,mode=state.mode){
  if(!query)return "";
  const url=new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api","1");
  url.searchParams.set("destination",query);
  url.searchParams.set("travelmode",mode);
  url.searchParams.set("dir_action","navigate");
  return url.toString();
}
function navQueryFor(place){
  if(place.navQuery)return place.navQuery;
  if(!place.privateNavKey)return "";
  try{return localStorage.getItem("hokkaido-private-nav-"+place.privateNavKey)||"";}catch{return "";}
}
function privateNavForm(place){
  if(!place.privateNavKey)return "";
  const saved=navQueryFor(place);
  const isStay=place.privateNavKey==="otaru-airbnb";
  const instructions=isStay
    ? `從${sourceLink(place.privateSource,"原 Notion 住宿頁")}複製地址或座標，設定一次後只儲存在這台裝置的瀏覽器。`
    : "從租車確認單複製實際營業所地址或座標；取車與還車地點可能不同。設定只儲存在這台裝置的瀏覽器。";
  return `<form class="private-nav-form" data-private-form="${esc(place.privateNavKey)}">
    <label for="private-${esc(place.privateNavKey)}">${isStay?"小樽住宿":"租車營業所"}導航位置</label>
    <p>${instructions}</p>
    <div><input id="private-${esc(place.privateNavKey)}" name="destination" type="text" value="${esc(saved)}" placeholder="貼上地址或經緯度" autocomplete="off" required>
    <button class="button button-primary" type="submit">儲存導航</button></div>
  </form>`;
}
function sourceLink(url,label){
  if(!url || !/^https:\/\//i.test(url))return "";
  return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
}
function nextPlace(day){
  const all=dayPlaces(day).filter(p=>navQueryFor(p) && !state.done.has(p.id));
  if(!all.length)return null;
  const isToday=state.data.days[day-1].date===localToday();
  if(!isToday)return all[0];
  const now=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
  return all.find(p=>!p.time || p.time>=now) || all[0];
}
function selectView(view,scroll=true){
  state.view=view;
  $$(".nav-link").forEach(b=>b.classList.toggle("active",b.dataset.view===view));
  $$(".view-section").forEach(s=>s.classList.toggle("hidden",s.dataset.section!==view));
  if(view==="explore")renderExplore();
  if(view==="essentials"){renderEssentials();loadWeather();}
  if(scroll)$(`[data-section="${view}"]`).scrollIntoView({behavior:"smooth",block:"start"});
}
function selectDay(day){
  state.day=day;
  state.mode=day<=5?"driving":day===6?"walking":"transit";
  renderItinerary();
}
function renderTabs(){
  $("#day-tabs").innerHTML=state.data.days.map(d=>
    `<button type="button" class="day-tab ${d.day===state.day?"active":""}" role="tab" aria-selected="${d.day===state.day}" data-day="${d.day}">
      <small>DAY ${String(d.day).padStart(2,"0")}</small><strong>${esc(d.label)}</strong><span>${esc(d.route.split(" → ")[0])}</span></button>`).join("");
}
function renderBanner(){
  const meta=state.data.days[state.day-1];
  const places=dayPlaces(state.day);
  const done=places.filter(p=>state.done.has(p.id)).length;
  $("#day-banner").innerHTML=`<div><div class="day-index">DAY ${String(state.day).padStart(2,"0")} · ${esc(meta.date)} · ${state.day===7?"航班抵台時間另標":"日本時間"}</div>
    <h3>${esc(meta.title)}</h3><p>${esc(meta.route)}</p></div>
    <div class="banner-stat"><strong>${done} / ${places.length}</strong><span>已完成行程</span></div>`;
  $("#day-count").textContent=`${meta.label} · ${places.length} 個行程`;
}
function renderStop(place,index){
  const done=state.done.has(place.id),glyph=glyphs[place.category]||"北";
  const image=place.image
    ? `<div class="stop-image" role="img" aria-label="${esc(place.image.alt||place.name)}" ${imgStyle(place)}><span class="image-index">${String(index+1).padStart(2,"0")}</span>${imageBadge(place.image)}</div>`
    : `<div class="stop-image placeholder" role="img" aria-label="此地點尚無已授權照片" data-glyph="${esc(glyph)}"><span class="image-index">${String(index+1).padStart(2,"0")}</span></div>`;
  const query=navQueryFor(place);
  const nav=query
    ? `<a class="text-button primary-link" href="${esc(navigationUrl(query))}" target="_blank" rel="noopener noreferrer">開始導航 ↗</a>`
    : place.privateNavKey?`<button type="button" class="text-button primary-link" data-detail="${esc(place.id)}">設定目的地 →</button>`
    : `<span class="text-button" aria-label="此項目尚無可確認的導航地點">地點待確認</span>`;
  const note=place.note?`<p class="stop-note">${esc(place.note)}</p>`:"";
  return `<article class="stop ${done?"done":""}" id="stop-${esc(place.id)}">
    <div class="stop-time"><strong>${esc(place.time||"未定")}</strong>${isReturnFlight(place)?`<span>日本起飛</span>${place.endTime?`<span class="stop-end">${esc(place.endTime)}</span><span>台灣抵達</span>`:""}`:`${place.endTime?`<span class="stop-end">至 ${esc(place.endTime)}</span>`:""}<span>${place.time?"日本時間":"時間待確認"}</span>`}</div>
    <div class="stop-card"><div class="stop-card-inner">${image}
      <div class="stop-content"><div class="stop-top"><span class="category-tag">${esc(place.category)} · ${esc(place.city||"北海道")}</span>
        <button class="check-button" type="button" data-done="${esc(place.id)}" aria-label="${done?"標記未完成":"標記完成"}：${esc(place.name)}" aria-pressed="${done}">✓</button></div>
        <h4 class="stop-title">${esc(place.name)}</h4>${place.localName?`<p class="stop-local">${esc(place.localName)}</p>`:""}
        <p class="stop-summary">${esc(place.summary)}</p>${note}</div></div>
      <div class="stop-actions">${nav}<span class="divider"></span>
        <button type="button" class="text-button" data-detail="${esc(place.id)}">閱讀解說 →</button></div></div></article>`;
}
function renderTimeline(){
  const places=dayPlaces(state.day);
  $("#timeline").innerHTML=places.map(renderStop).join("");
}
function renderAside(){
  const next=nextPlace(state.day);
  $("#next-card").classList.add("dark");
  $("#next-card").innerHTML=next
    ? `<span class="aside-kicker">NEXT DESTINATION / 下一站</span><h4>${esc(next.name)}</h4>
       <p>${esc(next.summary)}</p><span class="small-meta">${esc(timeRange(next))} · ${esc(next.city||"北海道")}</span>
       <a class="button button-primary" href="${esc(navigationUrl(navQueryFor(next)))}" target="_blank" rel="noopener noreferrer">導航到下一站 ↗</a>`
    : `<span class="aside-kicker">ALL DONE</span><h4>今天的路，走完了。</h4><p>可以到景點總覽看看備選地點。</p>`;
  const alerts=state.data.alerts.filter(x=>x.day===state.day);
  $("#day-alerts").innerHTML=`<span class="aside-kicker">HEADS UP / 行前提醒</span><h4>別忘了這些</h4>`
    +(alerts.length?alerts.map(a=>`<div class="aside-alert"><strong>${esc(a.title)}</strong><p>${esc(a.text)}</p>${sourceLink(a.url,"官方資訊")}</div>`).join("")
      :`<p>今日沒有已知的時間衝突。營業及路況仍請於出發前查看。</p>`);
  const verified=state.data.verified.filter(x=>x.day===state.day);
  $("#day-verified").innerHTML=`<span class="aside-kicker">CHECKED / 已查核</span><h4>官方資訊</h4>`
    +(verified.length?verified.map(x=>`<div class="official-item"><strong>${esc(x.title)}</strong><p>${esc(x.text)}</p>${sourceLink(x.url,"查看官網")}</div>`).join("")
      :`<p>開放時間與票價仍請以景點官網及現場公告為準。</p>`);
}
function renderItinerary(){
  renderTabs();renderBanner();renderTimeline();renderAside();
}
function groups(){
  return ["全部","已排程","備選","預排","未排程","收藏"];
}
function renderFilters(){
  $("#group-filters").innerHTML=groups().map(g=>`<button type="button" class="filter-chip ${g===state.group?"active":""}" data-group="${esc(g)}">${esc(g)}</button>`).join("");
}
function filteredPlaces(){
  const q=state.search.trim().toLocaleLowerCase();
  return state.data.places.filter(p=>{
    const inGroup=state.group==="全部"||state.group==="收藏"&&state.favorites.has(p.id)||p.group===state.group;
    const inSearch=!q||[p.name,p.localName,p.city,p.category,p.summary].some(s=>(s||"").toLocaleLowerCase().includes(q));
    return inGroup&&inSearch;
  }).sort((a,b)=>{
    const da=a.day||99,db=b.day||99;
    return da-db || (a.time||"99:99").localeCompare(b.time||"99:99") || a.name.localeCompare(b.name,"zh-Hant");
  });
}
function renderExploreCard(p){
  const glyph=glyphs[p.category]||"北";
  return `<article class="explore-card">
    <div class="card-photo" role="img" aria-label="${esc(p.image?p.image.alt||p.name:"此地點尚無已授權照片")}" ${imgStyle(p)}>${p.image?imageBadge(p.image):esc(glyph)}</div>
    <div class="card-body"><span class="card-meta">${esc(p.group)} ${p.day?"· DAY "+String(p.day).padStart(2,"0"):""} · ${esc(p.city||"北海道")}</span>
      <h3>${esc(p.name)}</h3><p>${esc(p.summary)}</p></div>
    <div class="card-actions"><button type="button" class="text-button" data-detail="${esc(p.id)}">查看解說 →</button>
      <button type="button" class="heart-button ${state.favorites.has(p.id)?"active":""}" data-favorite="${esc(p.id)}" aria-label="${state.favorites.has(p.id)?"取消收藏":"收藏"}：${esc(p.name)}" aria-pressed="${state.favorites.has(p.id)}">♥</button></div>
  </article>`;
}
function renderExplore(){
  renderFilters();
  const list=filteredPlaces();
  $("#explore-count").textContent=`共 ${list.length} 個地點 · 「備選」「預排」「未排程」均不屬於每日正式行程`;
  $("#explore-grid").innerHTML=list.length?list.map(renderExploreCard).join(""):
    `<div class="empty-state">沒有符合條件的地點。試試不同關鍵字。</div>`;
}
function shiftDate(date,days){
  return new Date(Date.parse(date+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
}
function shortDate(date){return date.slice(5).replace("-","/");}
function weatherDescription(code,isDay=1){
  if(isDay===0&&[0,1,2].includes(code))return ["☾",code===0?"晴朗":code===1?"大致晴朗":"局部多雲"];
  if(code===0)return ["☀","晴朗"];
  if(code===1)return ["🌤","大致晴朗"];
  if(code===2)return ["⛅","局部多雲"];
  if(code===3)return ["☁","陰天"];
  if(code===45||code===48)return ["🌫","起霧"];
  if([51,53,55,56,57].includes(code))return ["🌦","毛毛雨"];
  if([61,63,65,66,67,80,81,82].includes(code))return ["🌧","下雨"];
  if([71,73,75,77,85,86].includes(code))return ["❄","降雪"];
  if([95,96,99].includes(code))return ["⛈","雷雨"];
  return ["◌","天氣待確認"];
}
function weatherTemperature(value,fallback="溫度待更新"){
  return Number.isFinite(value)?`${Math.round(value)}°C`:fallback;
}
function weatherUpdatedLabel(){
  return new Intl.DateTimeFormat("zh-TW",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(weatherState.updatedAt));
}
function renderWeatherPeriods(forecast){
  return `<div class="weather-periods">${weatherPeriods.map(period=>{
    const values=forecast?.periods?.[period.id];
    const [icon,label]=weatherDescription(values?.code,values?.isDay);
    const rain=Number.isFinite(values?.rain)?`降雨 ${Math.round(values.rain)}%`:"降雨待更新";
    return `<div class="weather-period"><div class="weather-period-head"><b>${period.label}</b><time>${period.time}</time></div>
      <div class="weather-period-condition"><span class="weather-icon" aria-hidden="true">${icon}</span><span>${esc(label)}</span></div>
      <strong>${esc(weatherTemperature(values?.temp))}</strong>
      <small>體感 ${esc(weatherTemperature(values?.feels,"待更新"))}</small><small>${esc(rain)}</small></div>`;
  }).join("")}</div>`;
}
function parseWeatherRecords(items,locations){
  if(items.length!==locations.length)throw new Error("地點資料不完整");
  const records={};
  items.forEach((item,index)=>{
    if(!Array.isArray(item.daily?.time))throw new Error("逐日資料不完整");
    const hourly=item.hourly||{};
    const hourIndex=new Map((hourly.time||[]).map((time,i)=>[time,i]));
    records[locations[index].id]={};
    item.daily.time.forEach((date,i)=>{
      const periods={};
      weatherPeriods.forEach(period=>{
        const hour=hourIndex.get(`${date}T${period.time}`);
        if(hour===undefined)return;
        periods[period.id]={code:hourly.weather_code?.[hour],temp:hourly.temperature_2m?.[hour],
          feels:hourly.apparent_temperature?.[hour],rain:hourly.precipitation_probability?.[hour],isDay:hourly.is_day?.[hour]};
      });
      records[locations[index].id][date]={code:item.daily.weather_code?.[i],
        hi:item.daily.temperature_2m_max?.[i],lo:item.daily.temperature_2m_min?.[i],
        rain:item.daily.precipitation_probability_max?.[i],periods};
    });
  });
  return records;
}
function renderWeather(){
  if(!state.data)return;
  const today=localToday(),horizon=shiftDate(today,15);
  const first=state.data.days[0].date,last=state.data.days.at(-1).date;
  let status="";
  if(today>last)status="旅程日期已過，本站不會把目前天氣誤當成當時預報。";
  else if(horizon<first)status=`目前逐日預報最多到 ${shortDate(horizon)}；旅行日預報將自 ${shortDate(shiftDate(first,-15))} 起陸續顯示。`;
  else if(weatherState.loading)status="正在讀取旅行地點的早、中、晚預報…";
  else if(weatherState.error)status=`天氣暫時無法更新：${weatherState.error}。${weatherState.updatedAt?`目前保留 ${weatherUpdatedLabel()} 日本時間的資料。`:""}可稍後再按「更新天氣」。`;
  else if(weatherState.updatedAt)status=`已更新 · ${weatherUpdatedLabel()} 日本時間 · 早、中、晚為指定時刻的逐時預報`;
  else status="正在準備早、中、晚預報。";
  $("#weather-status").textContent=status;
  const locations=new Map(state.data.weatherLocations.map(loc=>[loc.id,loc]));
  $("#weather-grid").innerHTML=state.data.weatherByDay.map(item=>{
    const day=state.data.days[item.day-1],date=day.date;
    const spots=item.locationIds.map(id=>{
      const loc=locations.get(id),forecast=weatherState.records?.[id]?.[date];
      let weather="";
      if(date<today)weather='<span class="weather-pending">日期已過</span>';
      else if(date>horizon)weather=`<span class="weather-pending">${shortDate(shiftDate(date,-15))} 起可查</span>`;
      else if(forecast){
        const [icon,label]=weatherDescription(forecast.code);
        const temp=!Number.isFinite(forecast.lo)||!Number.isFinite(forecast.hi)?"溫度待更新":`全天 ${Math.round(forecast.lo)}–${Math.round(forecast.hi)}°C`;
        const rain=!Number.isFinite(forecast.rain)?"降雨待更新":`最高降雨 ${Math.round(forecast.rain)}%`;
        weather=`<span class="weather-icon" aria-hidden="true">${icon}</span><span class="weather-condition">${esc(label)}</span><strong>${esc(temp)}</strong><small>${esc(rain)}</small>`;
      }else weather=`<span class="weather-pending">${weatherState.loading?"讀取中":"預報待更新"}</span>`;
      const periods=date>=today&&date<=horizon?renderWeatherPeriods(forecast):"";
      return `<div class="weather-spot"><div class="weather-spot-head"><span class="weather-place">${esc(loc.name)}</span><div class="weather-values">${weather}</div></div>${periods}</div>`;
    }).join("");
    return `<article class="weather-day"><div class="weather-day-head"><span>DAY ${String(item.day).padStart(2,"0")}</span><strong>${esc(day.label)}</strong><small>${esc(day.route)}</small></div><div class="weather-spots">${spots}</div></article>`;
  }).join("");
}
async function loadWeather(force=false){
  if(weatherState.loading||!state.data)return;
  const today=localToday(),first=state.data.days[0].date,last=state.data.days.at(-1).date;
  if(shiftDate(today,15)<first||today>last){renderWeather();return;}
  if(!force){
    try{
      const saved=JSON.parse(localStorage.getItem(weatherCacheKey)||"null");
      if(saved?.records && saved.forecastDate===today && Date.now()-saved.updatedAt<30*60*1000){
        weatherState.records=saved.records;weatherState.updatedAt=saved.updatedAt;weatherState.error=null;
        renderWeather();return;
      }
    }catch{}
  }
  weatherState.loading=true;weatherState.error=null;renderWeather();
  const locations=state.data.weatherLocations;
  const url=new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude",locations.map(x=>x.lat).join(","));
  url.searchParams.set("longitude",locations.map(x=>x.lon).join(","));
  url.searchParams.set("daily","weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max");
  url.searchParams.set("hourly","weather_code,temperature_2m,apparent_temperature,precipitation_probability,is_day");
  url.searchParams.set("timezone","Asia/Tokyo");
  url.searchParams.set("forecast_days","16");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{signal:controller.signal});
    if(!response.ok)throw new Error("預報服務回應失敗");
    const result=await response.json(),items=Array.isArray(result)?result:[result];
    const records=parseWeatherRecords(items,locations);
    weatherState.records=records;weatherState.updatedAt=Date.now();
    try{localStorage.setItem(weatherCacheKey,JSON.stringify({records,updatedAt:weatherState.updatedAt,forecastDate:today}));}catch{}
  }catch(error){weatherState.error=error.name==="AbortError"?"連線逾時":"請確認網路連線";}
  finally{clearTimeout(timer);weatherState.loading=false;renderWeather();}
}
function renderEssentials(){
  renderWeather();
  $("#flights").innerHTML=state.data.flights.map(f=>`<div class="flight-row">
    <span class="flight-direction">${esc(f.direction)} · ${esc(f.date)}</span>
    <strong>${esc(f.flight)}</strong>
    <div class="flight-times"><div><small>${esc(f.from)} · ${esc(f.departureZone)}</small><b>${esc(f.departure)}</b></div>
      <span aria-hidden="true">→</span><div><small>${esc(f.to)} · ${esc(f.arrivalZone)}</small><b>${esc(f.arrival)}</b></div></div>
  </div>`).join("");
  $("#stays").innerHTML=state.data.stays.map(s=>`<div class="info-row stay-row">
    <div class="stay-photo" role="img" aria-label="${esc(s.image?.alt||s.name)}" ${imgStyle(s)}>${imageBadge(s.image)}</div>
    <div><small>${esc(s.nights)}</small><strong>${esc(s.name)}</strong></div>
    ${navQueryFor(s)?`<a class="text-button primary-link" href="${esc(navigationUrl(navQueryFor(s)))}" target="_blank" rel="noopener noreferrer">導航 ↗</a>`:""}</div>
    ${s.privateNavKey?privateNavForm(s):""}`).join("");
  $("#all-alerts").innerHTML=state.data.alerts.map(a=>`<div class="alert-box">
    <small>DAY ${String(a.day).padStart(2,"0")}</small><h4>${esc(a.title)}</h4><p>${esc(a.text)}</p>${sourceLink(a.url,"查看來源")}</div>`).join("");
}
function inlineMarkdown(text){
  let output="",last=0;
  const pattern=/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  for(const match of text.matchAll(pattern)){
    output+=esc(text.slice(last,match.index));
    output+=`<a href="${esc(match[2])}" target="_blank" rel="noopener noreferrer">${esc(match[1])}</a>`;
    last=match.index+match[0].length;
  }
  output+=esc(text.slice(last));
  output=output.replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>");
  output=output.replace(/`([^`]+)`/g,"<code>$1</code>");
  return output;
}
function notesHtml(body){
  const lines=body.split("\n"),out=[];let list=null;
  const close=()=>{if(list){out.push(`</${list}>`);list=null;}};
  for(const raw of lines){
    const line=raw.trim();
    if(!line){close();continue;}
    if(/^---+$/.test(line)){close();out.push('<div class="separator"></div>');continue;}
    const head=line.match(/^(#{1,4})\s+(.+)$/);
    if(head){close();out.push(`<h${Math.min(4,head[1].length+2)}>${inlineMarkdown(head[2])}</h${Math.min(4,head[1].length+2)}>`);continue;}
    if(line.startsWith(">")){close();out.push(`<blockquote>${inlineMarkdown(line.replace(/^>\s*/,""))}</blockquote>`);continue;}
    const bullet=line.match(/^[-*]\s+(.+)$/),number=line.match(/^\d+\.\s+(.+)$/);
    if(bullet||number){const type=bullet?"ul":"ol";if(list!==type){close();out.push(`<${type}>`);list=type;}out.push(`<li>${inlineMarkdown((bullet||number)[1])}</li>`);continue;}
    close();out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  close();return out.join("");
}
function photoCredit(image){
  if(!image)return "";
  const source=image.source==="Wikimedia Commons"?
    `${image.artist?esc(image.artist)+" · ":""}${esc(image.license)} · Wikimedia Commons`:
    `原 Notion 引用圖片 · ${esc(image.source)}`;
  return `<p class="source-line">${image.representative?"參考照片（非此行程地點實景）":"圖片"}：${source} ${sourceLink(image.sourceUrl,"來源")}</p>`;
}
function detailFacts(place){
  const facts=[];
  if(place.hours)facts.push(["開放時間",place.hours]);
  if(place.ticketInfo)facts.push(["票價／預約",place.ticketInfo]);
  else if(place.ticketYen!==null&&place.ticketYen!==undefined)facts.push(["參考票價",place.ticketYen===0?"免費":`約 ¥${place.ticketYen.toLocaleString()}`]);
  if(place.drive)facts.push(["交通／車程",place.drive]);
  return facts.length?`<section class="dialog-section"><h3>實用資訊</h3><div class="fact-list">${facts.map(([label,value])=>
    `<div class="fact"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}</div></section>`:"";
}
function openDetail(id){
  const p=state.data.places.find(x=>x.id===id);if(!p)return;
  const hero=p.image
    ?`<div class="dialog-hero" role="img" aria-label="${esc(p.image.alt||p.name)}" ${imgStyle(p)}>${imageBadge(p.image)}</div>`
    :`<div class="dialog-hero" role="img" aria-label="此地點尚無已授權照片">${esc(glyphs[p.category]||"北")}</div>`;
  const query=navQueryFor(p);
  const nav=query?`<a class="button button-primary" href="${esc(navigationUrl(query))}" target="_blank" rel="noopener noreferrer">Google Maps 導航 ↗</a>`:"";
  const alertTitle={"藻岩山展望台｜中腹駅":"藻岩山導航至中腹站","登別伊達時代村":"登別入園與演出銜接",
    "千歲還車":"還車地點須看確認單","迴轉壽司 Toriton Kita 8":"壽司用餐時段差兩小時",
    "北海道 to 台灣":"回程請以日本時間報到"}[p.name];
  const relatedAlert=state.data.alerts.find(a=>a.title===alertTitle);
  const warning=relatedAlert?`<div class="notice-inline"><strong>${esc(relatedAlert.title)}：</strong> ${esc(relatedAlert.text)} ${sourceLink(relatedAlert.url,"來源")}</div>`:"";
  const highlights=p.highlights.length?`<section class="dialog-section"><h3>值得看什麼</h3><ul>${p.highlights.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>`:"";
  const tips=p.tips.length?`<section class="dialog-section"><h3>旅遊小提醒</h3><ul>${p.tips.map(x=>`<li>${esc(x)}</li>`).join("")}</ul></section>`:"";
  $("#dialog-content").innerHTML=hero+`<div class="dialog-body">
    <div class="dialog-meta">${esc(p.group)} ${p.day?"· DAY "+String(p.day).padStart(2,"0"):""} · ${esc(p.city||"北海道")} · ${esc(p.category)}${p.time?" · "+esc(timeRange(p))+(isReturnFlight(p)?"":" JST"):""}</div>
    <h2 id="dialog-title">${esc(p.name)}</h2>${p.localName?`<p class="dialog-local">${esc(p.localName)}</p>`:""}
    <p class="dialog-summary">${esc(p.summary)}</p>
    ${p.note?`<div class="notice-inline"><strong>行程備註：</strong> ${esc(p.note)}</div>`:""}
    ${warning}
    <div class="dialog-actions">${nav}
      <button class="button button-outline" type="button" data-copy="${esc(p.localName||p.name)}">複製地名</button>
      ${p.official?`<a class="button button-outline" href="${esc(p.official)}" target="_blank" rel="noopener noreferrer">官方網站 ↗</a>`:""}
    </div>
    ${privateNavForm(p)}
    ${highlights}${detailFacts(p)}${tips}
    ${p.body?`<details class="note-disclosure"><summary>閱讀完整景點筆記</summary><div class="long-note">${notesHtml(p.body)}</div></details>`:""}
    <section class="dialog-section"><h3>資料與來源</h3>
      <p class="source-line">Notion 行程與景點內頁整理於 ${esc(state.data.lastReviewed)}。時刻、票價及營業資訊可能改變。</p>
      <p class="source-line">${sourceLink(p.notion,"查看 Notion 原頁")}${p.official?" · "+sourceLink(p.official,"景點官網"):""}</p>
      ${photoCredit(p.image)}</section></div>`;
  $("#place-dialog").showModal();
}
function onSubmit(e){
  const form=e.target.closest("[data-private-form]");if(!form)return;
  e.preventDefault();
  const value=form.elements.destination.value.trim();if(!value)return;
  try{localStorage.setItem("hokkaido-private-nav-"+form.dataset.privateForm,value);}catch{toast("瀏覽器無法儲存，請檢查隱私設定");return;}
  renderItinerary();renderEssentials();
  if($("#place-dialog").open){
    const p=state.data.places.find(x=>x.privateNavKey===form.dataset.privateForm);
    $("#place-dialog").close();if(p)openDetail(p.id);
  }
  toast("導航位置已儲存在這台裝置");
}
function onClick(e){
  const nav=e.target.closest("[data-view]");if(nav){selectView(nav.dataset.view);return;}
  const day=e.target.closest("[data-day]");if(day){selectDay(Number(day.dataset.day));return;}
  const refresh=e.target.closest("[data-weather-refresh]");if(refresh){loadWeather(true);return;}
  const done=e.target.closest("[data-done]");if(done){
    const id=done.dataset.done;state.done.has(id)?state.done.delete(id):state.done.add(id);
    saveSet("hokkaido-done",state.done);renderItinerary();toast(state.done.has(id)?"已標記完成":"已恢復為未完成");return;
  }
  const group=e.target.closest("[data-group]");if(group){state.group=group.dataset.group;renderExplore();return;}
  const favorite=e.target.closest("[data-favorite]");if(favorite){
    const id=favorite.dataset.favorite;state.favorites.has(id)?state.favorites.delete(id):state.favorites.add(id);
    saveSet("hokkaido-favorites",state.favorites);renderExplore();toast(state.favorites.has(id)?"已加入收藏":"已取消收藏");return;
  }
  const detail=e.target.closest("[data-detail]");if(detail){openDetail(detail.dataset.detail);return;}
  const copy=e.target.closest("[data-copy]");if(copy){navigator.clipboard.writeText(copy.dataset.copy).then(()=>toast("地名已複製")).catch(()=>toast("無法複製，請手動選取地名"));return;}
}
async function init(){
  try{
    const response=await fetch("./data.json");if(!response.ok)throw new Error("資料載入失敗");
    state.data=await response.json();
    const today=localToday();
    const match=state.data.days.find(d=>d.date===today);
    state.day=match?.day||1;
    state.mode=state.day<=5?"driving":state.day===6?"walking":"transit";
    renderItinerary();renderExplore();renderEssentials();
    document.addEventListener("click",onClick);
    document.addEventListener("submit",onSubmit);
    $("#search").addEventListener("input",e=>{state.search=e.target.value;renderExplore();});
    $("#dialog-close").addEventListener("click",()=>$("#place-dialog").close());
    $("#place-dialog").addEventListener("click",e=>{if(e.target===$("#place-dialog"))$("#place-dialog").close();});
    if(location.hash==="#explore")selectView("explore",false);
    if(location.hash==="#essentials")selectView("essentials",false);
    if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")){
      navigator.serviceWorker.register("./sw.js").catch(()=>{});
    }
  }catch(error){
    $("#timeline").innerHTML=`<p role="alert">行程資料目前無法載入。請重新整理網頁。<br><small>${esc(error.message)}</small></p>`;
  }
}
init();
