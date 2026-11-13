import{r as e}from"./rolldown-runtime-XKyaHtl9.js";import{h as t}from"./vendor-charts-5nAF7jLJ.js";import{r as n}from"./vendor-chess-D9RNrWkV.js";var r=e(t(),1),i={art:[],models:[{id:`hearth_brazier`,name:`Hearth Brazier 3D`,description:`Low-poly brass hearth ring with glowing central candle`,style:`low-poly`,parts:[{shape:`torus`,position:[0,0,0],scale:[1.5,1.5,.3],color:`#b87d3b`},{shape:`cylinder`,position:[0,.3,0],scale:[.3,.8,.3],color:`#e8d0a7`},{shape:`sphere`,position:[0,.85,0],scale:[.2,.3,.2],color:`#ffae2b`,emissive:`#ff7b1c`}]}],sounds:[{id:`coal_slide`,name:`Coal Slide`,description:`Warm stone slide across brass ring`,waveform:`triangle`,startFreq:320,endFreq:180,duration:.12,volume:.18},{id:`vent_ignite`,name:`Vent Ignite`,description:`Sparkling chime when a coal pins into an air vent`,waveform:`sine`,startFreq:587.33,endFreq:1174.66,duration:.24,volume:.22}],music:[{id:`hearth_bgm`,name:`Fireside Ambience Loop`,mood:`warm, cozy, mysterious`,bpm:96,waveform:`triangle`,notes:[261.63,329.63,392,523.25,392,329.63],noteDuration:.35}],voices:[]},a=[{type:`function`,function:{name:`generate_art_asset`,description:`Generate 2D game art, sprites, backgrounds, textures, or cover art using Pollinations Image AI.`,parameters:{type:`object`,properties:{id:{type:`string`,description:`Unique asset identifier (e.g. player_ship)`},name:{type:`string`,description:`Human-readable asset name`},role:{type:`string`,enum:[`sprite`,`background`,`texture`,`cover`,`ui`]},prompt:{type:`string`,description:`Detailed visual description for Pollinations image generation`}},required:[`id`,`name`,`role`,`prompt`]}}},{type:`function`,function:{name:`generate_3d_model`,description:`Generate a 3D model composed of 3D primitives and optional Pollinations texture for Three.js/WebGL games.`,parameters:{type:`object`,properties:{id:{type:`string`,description:`Unique model ID (e.g. cyber_cruiser)`},name:{type:`string`,description:`Model display name`},description:{type:`string`,description:`Visual description of the 3D object`},style:{type:`string`,enum:[`low-poly`,`voxel`,`stylized`,`realistic`]},parts:{type:`array`,description:`3D mesh primitives that form the composite model`,items:{type:`object`,properties:{shape:{type:`string`,enum:[`box`,`sphere`,`cylinder`,`cone`,`torus`]},position:{type:`array`,items:{type:`number`},description:`[x, y, z]`},scale:{type:`array`,items:{type:`number`},description:`[sx, sy, sz]`},color:{type:`string`,description:`Hex color e.g. #38bdf8`},emissive:{type:`string`,description:`Optional emissive glow hex color`}},required:[`shape`,`position`,`scale`,`color`]}}},required:[`id`,`name`,`description`,`parts`]}}},{type:`function`,function:{name:`generate_sound_effect`,description:`Generate a synthesized or Pollinations audio sound effect (SFX) playable via window.OxyGame.playSound(id).`,parameters:{type:`object`,properties:{id:{type:`string`,description:`Sound cue ID (e.g. plasma_blast)`},name:{type:`string`,description:`Display name`},description:{type:`string`,description:`Sound description`},waveform:{type:`string`,enum:[`sine`,`square`,`sawtooth`,`triangle`]},startFreq:{type:`number`,description:`Starting frequency in Hz (e.g. 880)`},endFreq:{type:`number`,description:`Ending frequency in Hz (e.g. 120)`},duration:{type:`number`,description:`Duration in seconds (0.05 to 1.5)`}},required:[`id`,`name`,`waveform`,`startFreq`,`endFreq`,`duration`]}}},{type:`function`,function:{name:`generate_music_track`,description:`Compose a looping background music (BGM) track playable via window.OxyGame.playMusic(id).`,parameters:{type:`object`,properties:{id:{type:`string`,description:`Track ID (e.g. boss_theme)`},name:{type:`string`,description:`Track title`},mood:{type:`string`,description:`Musical mood or style`},bpm:{type:`number`,description:`Tempo in BPM (60 to 180)`},waveform:{type:`string`,enum:[`sine`,`square`,`sawtooth`,`triangle`]},notes:{type:`array`,items:{type:`number`},description:`Sequence of frequencies in Hz (e.g. [261.63, 329.63, 392.0, 523.25])`}},required:[`id`,`name`,`bpm`,`waveform`,`notes`]}}},{type:`function`,function:{name:`generate_voice_line`,description:`Generate spoken character dialogue or narration using Pollinations Text-to-Speech (TTS) playable via window.OxyGame.playVoice(id).`,parameters:{type:`object`,properties:{id:{type:`string`,description:`Voice cue ID (e.g. intro_narrator)`},name:{type:`string`,description:`Character or cue label`},text:{type:`string`,description:`Dialogue line to speak`},voice:{type:`string`,enum:[`alloy`,`echo`,`fable`,`onyx`,`nova`,`shimmer`]},language:{type:`string`,description:`Language code (e.g. en, ja, zh-CN, es, ko, ru)`}},required:[`id`,`name`,`text`]}}},{type:`function`,function:{name:`define_achievements`,description:`Define or update unlockable game achievements.`,parameters:{type:`object`,properties:{achievements:{type:`array`,items:{type:`object`,properties:{id:{type:`string`},title:{type:`string`},description:{type:`string`},points:{type:`number`}},required:[`id`,`title`,`description`]}}},required:[`achievements`]}}}];function o(e,t=`flux`,n){let r=encodeURIComponent(e.trim()),i=Math.floor(Math.random()*1e5),a=`https://image.pollinations.ai/prompt/${r}?model=${encodeURIComponent(t)}&width=512&height=512&nologo=true&seed=${i}`;return n&&n.trim()&&(a+=`&key=${encodeURIComponent(n.trim())}`),a}function s(e,t=`alloy`,n){let r=`https://gen.pollinations.ai/audio/${encodeURIComponent(e.trim().slice(0,500))}?voice=${encodeURIComponent(t)}`;return n&&n.trim()&&(r+=`&key=${encodeURIComponent(n.trim())}`),r}function c(e,t,n,r,i,a){let c={art:[...n.art],models:[...n.models],sounds:[...n.sounds],music:[...n.music],voices:[...n.voices]},l=[...r],u,d=``;if(e===`generate_art_asset`){let e=String(t.id||`art_${Date.now().toString(36)}`),n=String(t.name||e),r=t.role||`sprite`,s=String(t.prompt||n),l=o(s,i,a),f={id:e,name:n,role:r,prompt:s,url:l,model:i};c.art=[...c.art.filter(t=>t.id!==e),f],r===`cover`&&(u=l),d=`Generated ${r} art "${n}" via Pollinations (${i})`}else if(e===`generate_3d_model`){let e=String(t.id||`model_${Date.now().toString(36)}`),n=String(t.name||e),r=String(t.description||n),s=t.style||`low-poly`,l=Array.isArray(t.parts)&&t.parts.length>0?t.parts.map(e=>({shape:e.shape||`box`,position:Array.isArray(e.position)&&e.position.length===3?e.position:[0,0,0],scale:Array.isArray(e.scale)&&e.scale.length===3?e.scale:[1,1,1],rotation:Array.isArray(e.rotation)&&e.rotation.length===3?e.rotation:[0,0,0],color:String(e.color||`#38bdf8`),emissive:e.emissive?String(e.emissive):void 0})):[{shape:`box`,position:[0,0,0],scale:[1,1,1],color:`#38bdf8`}],u={id:e,name:n,description:r,style:s,parts:l,textureUrl:o(`seamless 3d texture for ${r}`,i,a)};c.models=[...c.models.filter(t=>t.id!==e),u],d=`Generated 3D model "${n}" (${l.length} meshes)`}else if(e===`generate_sound_effect`){let e=String(t.id||`sfx_${Date.now().toString(36)}`),n=String(t.name||e),r={id:e,name:n,description:String(t.description||n),waveform:t.waveform||`sawtooth`,startFreq:Number(t.startFreq)||660,endFreq:Number(t.endFreq)||180,duration:Math.max(.05,Math.min(2,Number(t.duration)||.18)),volume:Number(t.volume)||.2};c.sounds=[...c.sounds.filter(t=>t.id!==e),r],d=`Synthesized SFX "${n}" (${r.waveform}, ${r.startFreq}Hz → ${r.endFreq}Hz)`}else if(e===`generate_music_track`){let e=String(t.id||`bgm_${Date.now().toString(36)}`),n=String(t.name||e),r=Array.isArray(t.notes)&&t.notes.length>0?t.notes.map(e=>Number(e)||440):[261.63,329.63,392,523.25],i=Number(t.bpm)||120,a={id:e,name:n,mood:String(t.mood||`arcade`),bpm:i,waveform:t.waveform||`triangle`,notes:r,noteDuration:Number((60/i/2).toFixed(2))};c.music=[...c.music.filter(t=>t.id!==e),a],d=`Composed BGM track "${n}" (${i} BPM, ${r.length} notes)`}else if(e===`generate_voice_line`){let e=String(t.id||`voice_${Date.now().toString(36)}`),n=String(t.name||e),r=String(t.text||`Ready Player One!`),i=t.voice||`alloy`,o={id:e,name:n,text:r,voice:i,language:String(t.language||`en`),audioUrl:s(r,i,a)};c.voices=[...c.voices.filter(t=>t.id!==e),o],d=`Generated TTS Voice "${n}" (${i}): "${r.slice(0,40)}"`}else e===`define_achievements`&&Array.isArray(t.achievements)&&t.achievements.length>0&&(l=t.achievements.map((e,t)=>({id:String(e.id||`ach_${t+1}`),title:String(e.title||`Achievement ${t+1}`),description:String(e.description||``),points:Number(e.points)||20})),d=`Defined ${l.length} game achievements`);return{assets:c,achievements:l,coverUrl:u,record:{id:`tc_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,toolName:e,args:t,summary:d||`Executed ${e}`}}}function l(e){let t=[],n=/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi,r;for(;(r=n.exec(e))!==null;)try{let e=JSON.parse(r[1]);e&&typeof e.name==`string`&&t.push({name:e.name,args:e.args||e.arguments||{}})}catch{}return t}var u=n();function d(e=i){return`
<script>
(function() {
  var muted = false;
  var audioCtx = null;
  var bgmInterval = null;
  var projectAssets = ${JSON.stringify(e).replace(/<\//g,`<\\/`)};

  function getAudioCtx() {
    if (muted) return null;
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) audioCtx = new AC();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function playCustomOrPresetSound(type) {
    var ctx = getAudioCtx();
    if (!ctx) return;
    try {
      var custom = (projectAssets.sounds || []).find(function(s) { return s.id === type || s.name === type; });
      var now = ctx.currentTime;
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (custom) {
        osc.type = custom.waveform || 'sawtooth';
        osc.frequency.setValueAtTime(custom.startFreq || 440, now);
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, custom.endFreq || 220), now + (custom.duration || 0.18));
        gain.gain.setValueAtTime(custom.volume || 0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (custom.duration || 0.18));
        osc.start(now);
        osc.stop(now + (custom.duration || 0.18));
        return;
      }

      if (type === 'laser') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === 'jump') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(240, now);
        osc.frequency.exponentialRampToValueAtTime(620, now + 0.16);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'coin' || type === 'powerup') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.start(now);
        osc.stop(now + 0.24);
      } else if (type === 'explosion' || type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.1);
        osc.frequency.setValueAtTime(783.99, now + 0.2);
        osc.frequency.setValueAtTime(1046.5, now + 0.3);
        gain.gain.setValueAtTime(0.22, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        osc.start(now);
        osc.stop(now + 0.5);
      } else if (type === 'lose') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.35);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.start(now);
        osc.stop(now + 0.35);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(280, now + 0.08);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      }
    } catch (e) {}
  }

  function playMusicTrack(trackId) {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
    var list = projectAssets.music || [];
    var track = trackId
      ? list.find(function(m) { return m.id === trackId || m.name === trackId; })
      : list[0];
    if (!track || !Array.isArray(track.notes) || track.notes.length === 0) return;

    var step = 0;
    var stepMs = Math.max(120, Math.round((60 / (track.bpm || 120) / 2) * 1000));
    bgmInterval = setInterval(function() {
      if (muted) return;
      var ctx = getAudioCtx();
      if (!ctx) return;
      try {
        var freq = track.notes[step % track.notes.length] || 261.63;
        step++;
        var now = ctx.currentTime;
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = track.waveform || 'triangle';
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.07, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (stepMs / 1000) * 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + (stepMs / 1000) * 0.9);
      } catch (e) {}
    }, stepMs);
  }

  function stopMusicTrack() {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
  }

  function playVoiceLine(voiceIdOrText) {
    if (muted) return;
    var voices = projectAssets.voices || [];
    var found = voices.find(function(v) { return v.id === voiceIdOrText || v.name === voiceIdOrText; });
    var url = found ? found.audioUrl : ('https://gen.pollinations.ai/audio/' + encodeURIComponent(String(voiceIdOrText).slice(0, 300)) + '?voice=alloy');
    var textToSpeak = found ? found.text : String(voiceIdOrText);

    try {
      var audio = new Audio(url);
      audio.onerror = function() {
        if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(textToSpeak));
        }
      };
      audio.play().catch(function() {
        if ('speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined') {
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(textToSpeak));
        }
      });
    } catch (e) {}
  }

  window.addEventListener('message', function(ev) {
    if (ev.data && ev.data.type === 'OXY_SET_MUTED') {
      muted = !!ev.data.muted;
      if (muted) stopMusicTrack();
    }
  });

  window.OxyGame = {
    assets: projectAssets,
    unlockAchievement: function(achievementId) {
      if (!achievementId) return;
      window.parent.postMessage({
        type: 'OXY_GAME_EVENT',
        source: 'oxy-game-sandbox',
        action: 'UNLOCK_ACHIEVEMENT',
        achievementId: String(achievementId)
      }, '*');
    },
    submitScore: function(score) {
      var num = Number(score);
      if (isNaN(num)) return;
      window.parent.postMessage({
        type: 'OXY_GAME_EVENT',
        source: 'oxy-game-sandbox',
        action: 'SUBMIT_SCORE',
        score: num
      }, '*');
    },
    playSound: function(soundType) {
      playCustomOrPresetSound(soundType || 'click');
    },
    playMusic: function(trackId) {
      playMusicTrack(trackId);
    },
    stopMusic: function() {
      stopMusicTrack();
    },
    playVoice: function(voiceIdOrText) {
      playVoiceLine(voiceIdOrText);
    },
    getArtUrl: function(artId) {
      var found = (projectAssets.art || []).find(function(a) { return a.id === artId || a.name === artId; });
      return found ? found.url : '';
    },
    getModel: function(modelId) {
      return (projectAssets.models || []).find(function(m) { return m.id === modelId || m.name === modelId; }) || null;
    }
  };

  window.parent.postMessage({
    type: 'init',
    source: 'oxy-game-sandbox'
  }, '*');
})();
<\/script>
`}function f(e,t=i){let n=e||``,r=d(t);return n.includes(`<head>`)?n.replace(`<head>`,`<head>${r}`):n.includes(`<body`)?`${r}\n${n}`:`<!DOCTYPE html><html><head><meta charset="utf-8" />${r}</head><body style="margin:0;background:#090d16;color:#fff;">${n}</body></html>`}function p(e,t,n){let r=globalThis.Origin;if(typeof r==`function`&&typeof r.from==`function`)try{let i=r.from(e);if(!n.isPinned&&e.source===t&&e.data?.type===`init`&&(n.current=i,n.isPinned=!0),n.isPinned&&n.current)return!!i.isSameOrigin(n.current)}catch{}return!!(t&&e.source===t||e.source===null&&e.data?.source===`oxy-game-sandbox`)}var m=({code:e,title:t=`Game Preview`,muted:n=!1,assets:a=i,onUnlockAchievement:o,onSubmitScore:s,onGameReady:c,className:l=``})=>{let d=(0,r.useRef)(null),m=globalThis.Origin,h=(0,r.useRef)({current:typeof m==`function`?new m:null,isPinned:!1}),[g]=(0,r.useState)(0),_=(0,r.useMemo)(()=>{let t=globalThis.Origin;return h.current={current:typeof t==`function`?new t:null,isPinned:!1},f(e,a)},[e,a,g]),v=(0,r.useCallback)(e=>{try{d.current?.contentWindow?.postMessage({type:`OXY_SET_MUTED`,muted:e},`*`)}catch{}},[]);return(0,r.useEffect)(()=>{v(n)},[n,v]),(0,r.useEffect)(()=>{let e=e=>{let t=e.data;t&&typeof t==`object`&&p(e,d.current?.contentWindow,h.current)&&(t.type===`init`?(v(n),c?.()):t.type===`OXY_GAME_EVENT`&&(t.action===`UNLOCK_ACHIEVEMENT`&&typeof t.achievementId==`string`?o?.(t.achievementId):t.action===`SUBMIT_SCORE`&&typeof t.score==`number`&&s?.(t.score)))};return window.addEventListener(`message`,e),()=>window.removeEventListener(`message`,e)},[n,o,s,c,v]),(0,u.jsx)(`div`,{className:`relative w-full h-full bg-slate-950 overflow-hidden ${l}`,children:(0,u.jsx)(`iframe`,{ref:d,title:t,srcDoc:_,sandbox:`allow-scripts allow-forms allow-pointer-lock`,className:`w-full h-full border-0 block`},g)})},h=({open:e,onClose:t,ariaLabelledBy:n,ariaLabel:i,className:a=``,children:o})=>{let s=(0,r.useRef)(null);return(0,r.useEffect)(()=>{let t=s.current;if(t){if(e){if(!t.open){if(typeof t.showModal==`function`)try{t.showModal()}catch{t.setAttribute(`open`,``)}else t.setAttribute(`open`,``)}}else t.open&&(typeof t.close==`function`?t.close():t.removeAttribute(`open`))}},[e]),(0,r.useEffect)(()=>{let e=s.current;if(!e)return;let n=()=>{t()};e.addEventListener(`close`,n);let r=typeof HTMLDialogElement<`u`&&`closedBy`in HTMLDialogElement.prototype,i=n=>{if(n.target!==e)return;let r=e.getBoundingClientRect();r.top<=n.clientY&&n.clientY<=r.top+r.height&&r.left<=n.clientX&&n.clientX<=r.left+r.width||(typeof e.close==`function`?e.close():t())};return r||e.addEventListener(`click`,i),()=>{e.removeEventListener(`close`,n),r||e.removeEventListener(`click`,i)}},[t]),e?(0,u.jsx)(`dialog`,{ref:s,closedby:`any`,"aria-labelledby":n,"aria-label":i,className:`backdrop:bg-black/70 backdrop:backdrop-blur-sm bg-slate-900 text-slate-100 border border-slate-700 rounded-2xl p-0 shadow-2xl max-w-4xl w-[94vw] max-h-[92vh] overflow-hidden ${a}`,children:o}):null};export{c as a,a as i,m as n,o,i as r,l as s,h as t};