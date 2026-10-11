(function(root,factory){const v=factory();if(typeof module==='object')module.exports=v;else root.EstateVoice=v;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 const names={en:'english',hi:'hindi|हिंदी|हिन्दी',mr:'marathi|मराठी',ml:'malayalam|മലയാളം',gu:'gujarati|ગુજરાતી',ta:'tamil|தமிழ்',te:'telugu|తెలుగు',kn:'kannada|ಕನ್ನಡ',bn:'bengali|বাংলা',pa:'punjabi|ਪੰਜਾਬੀ',or:'odia|ଓଡ଼ିଆ',as:'assamese|অসমীয়া',ur:'urdu|اردو'};
 function requestedLanguage(text){
  if(/\b(don't|do not|not|no)\b|नहीं|नको/i.test(text))return null;
  if(!/speak|talk|switch|continue|language|बात|बोल|please|में|മലയാളം|தமிழ்|తెలుగు|ಕನ್ನಡ/i.test(text)&&text.trim().split(/\s+/).length>3)return null;
  for(const [code,pattern]of Object.entries(names))if(new RegExp(pattern,'i').test(text))return code+'-IN';return null;
 }
 function detect(text,current){
  const explicit=requestedLanguage(text);if(explicit)return explicit;
  for(const [pattern,code]of [[/[\u0D00-\u0D7F]/,'ml-IN'],[/[\u0B80-\u0BFF]/,'ta-IN'],[/[\u0C00-\u0C7F]/,'te-IN'],[/[\u0C80-\u0CFF]/,'kn-IN'],[/[\u0A80-\u0AFF]/,'gu-IN'],[/[\u0A00-\u0A7F]/,'pa-IN'],[/[\u0B00-\u0B7F]/,'or-IN'],[/[\u0600-\u06FF]/,'ur-IN']])if(pattern.test(text))return code;
  if(/[\u0900-\u097F]/.test(text)){if(/आहे|मला|पाहिजे|किती|नाही|करायच/.test(text))return 'mr-IN';if(/है|हूँ|मुझे|चाहिए|कितना|नहीं|करना/.test(text))return 'hi-IN';return ['hi-IN','mr-IN'].includes(current)?current:'hi-IN';}
  if(/[\u0980-\u09FF]/.test(text))return current==='as-IN'?current:'bn-IN';
  return current;
 }
 function profile(store,lang){let p={};try{p=JSON.parse(store.get('lq.voice.'+lang)||'{}');}catch{}return {model:'bulbul:v3',gender:'female',speaker:'priya',pace:1,temperature:0.6,browserVoice:'',...p};}
 function save(store,lang,p){if(!/^[a-z]{2}-IN$/.test(lang))throw Error('Unsupported language');const pace=Number(p.pace),temperature=Number(p.temperature);if(!Number.isFinite(pace)||pace<0.5||pace>2||!Number.isFinite(temperature)||temperature<0||temperature>1)throw Error('Invalid voice settings');store.set('lq.voice.'+lang,JSON.stringify({...p,pace,temperature}));}
 return {requestedLanguage,detect,profile,save};
});
