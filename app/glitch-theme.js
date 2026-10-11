const themeSelect=document.createElement('select');themeSelect.className='gp-theme-switch';themeSelect.setAttribute('aria-label','Colour theme');themeSelect.innerHTML='<option value="dark">Emerald</option><option value="light">Light</option>';
function gpTheme(theme){document.body.dataset.theme=theme;themeSelect.value=theme;const img=document.querySelector('.ef-wordmark');if(img)img.src=theme==='light'?'brand/wordmark.svg':'brand/wordmark-white.svg';store.set('lq.theme',theme);}
document.querySelector('.ef-topright').prepend(themeSelect);themeSelect.onchange=()=>gpTheme(themeSelect.value);gpTheme(store.get('lq.theme')||'dark');
const navHeading=document.createElement('div');navHeading.className='gp-nav-section';navHeading.textContent='CONFIGURATION';$('nav').insertBefore(navHeading,$('nav').querySelector('[data-view=integrations]'));
for(const id of ['operations','calendar','building','map'])$('nav').insertBefore($('nav').querySelector('[data-view='+id+']'),navHeading);
// Ask for current area in the scripted demo as well as the AI conversation.
SCRIPT['en-IN'].q.splice(7,0,()=>"Which area are you coming from? A pincode or a nearby landmark and city is enough.");
SCRIPT['hi-IN'].q.splice(7,0,()=>"आप किस इलाके से आ रहे हैं? पिनकोड या पास का कोई लैंडमार्क और शहर बता सकते हैं।");FIELDS.splice(7,0,'origin');
const oldPortable=efPortable;efPortable=function(){return {...oldPortable(),projectOps:gRead('projectOps',{}),attempts:gAttempts(),campaigns:Object.fromEntries(Object.entries(gCampaigns()).map(([k,v])=>[k,{...v,enabled:false}]))};};
if(['calendar','building','map'].includes(store.get('lq.view')))showView(store.get('lq.view'));
