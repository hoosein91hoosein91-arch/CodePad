// This function is also serialized into exported lesson HTML. Keep it standalone.
export function mountLesson(config){
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
 const fingerprint=JSON.stringify(config).split('').reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261).toString(16);
 const key='codepad.lesson.'+fingerprint;
 let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
 if(!saved||typeof saved!=='object')saved={};
 const done=new Set(Array.isArray(saved.done)?saved.done:[]),answers=Object.assign(Object.create(null),saved.answers||{});let pending=null,lastSave=0,restoreTime=Number(saved.time)||0;
 const app=el('main','lesson-app'),top=el('header','lesson-top'),brand=el('span','lesson-brand','CODEPAD / LEARN');
 top.append(brand,el('span','lesson-badge','درس تعاملی · آفلاین'));app.append(top);
 const heading=el('section','lesson-heading');heading.append(el('p','lesson-eyebrow',config.subject||'یادگیری با تمرین'),el('h1','',config.title),el('p','lesson-description',config.description||'ویدیو را ببین و در ایستگاه‌های تمرین پاسخ بده.'));
 app.append(heading);const grid=el('div','lesson-grid'),main=el('section','lesson-main'),side=el('aside','lesson-outline');grid.append(main,side);app.append(grid);
 const stage=el('div','lesson-stage'),video=el('video','lesson-video');video.controls=true;video.playsInline=true;video.preload='metadata';video.src=config.video;if(config.poster)video.poster=config.poster;
 video.setAttribute('aria-label',config.title);stage.append(video);main.append(stage);
 const playback=el('div','lesson-playback'),clock=el('span','lesson-clock','00:00'),bar=el('progress','lesson-progress');bar.max=100;bar.value=0;bar.setAttribute('aria-label','پیشرفت پخش');playback.append(clock,bar);main.append(playback);
 const warning=el('p','lesson-warning');warning.setAttribute('role','status');warning.hidden=true;main.append(warning);
 const question=el('section','lesson-question');question.hidden=true;question.setAttribute('aria-live','polite');main.append(question);
 const result=el('section','lesson-result');result.hidden=true;main.append(result);
 side.append(el('p','lesson-eyebrow','ایستگاه‌های تمرین'),el('h2','','مسیر یادگیری'));
 const count=el('p','lesson-count'),list=el('ol','lesson-stops');side.append(count,list);
 const entries=config.checkpoints.map((q,index)=>{
  const li=el('li'),button=el('button','lesson-stop'),number=el('span','lesson-stop-number',String(index+1).padStart(2,'0')),info=el('span','lesson-stop-info');button.type='button';info.append(el('strong','',q.question),el('small','',format(q.time)));button.append(number,info);li.append(button);list.append(li);
  button.onclick=()=>{video.currentTime=q.time;inspect();};return {q,button,number};
 });
 const reset=el('button','lesson-reset','شروع دوبارهٔ درس');reset.type='button';side.append(reset,el('p','lesson-local-note','پیشرفت روی همین دستگاه ذخیره می‌شود.'));
 document.getElementById('lesson-root').replaceChildren(app);
 function format(time){const value=Math.max(0,Math.floor(Number(time)||0));return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
 function persist(force=false){if(!force&&Date.now()-lastSave<1000)return;lastSave=Date.now();try{localStorage.setItem(key,JSON.stringify({done:[...done],answers,time:video.currentTime}));}catch{}}
 function outline(){count.textContent=done.size+' از '+config.checkpoints.length+' ایستگاه کامل شده';for(const {q,button,number}of entries){button.dataset.complete=String(done.has(q.id));number.textContent=done.has(q.id)?'✓':String(config.checkpoints.indexOf(q)+1).padStart(2,'0');button.setAttribute('aria-current',String(pending?.id===q.id));}}
 function ask(q){
  pending=q;video.pause();if(document.fullscreenElement)document.exitFullscreen?.().catch(()=>{});if(video.webkitDisplayingFullscreen)video.webkitExitFullscreen?.();if(Math.abs(video.currentTime-q.time)>.5)video.currentTime=q.time;
  question.hidden=false;question.replaceChildren();question.append(el('p','lesson-eyebrow','ایستگاه '+(config.checkpoints.indexOf(q)+1)+' / '+format(q.time)),el('h2','',q.question));
  const choices=el('div','lesson-choices'),feedback=el('p','lesson-feedback'),next=el('button','lesson-continue','ادامهٔ ویدیو');next.type='button';next.disabled=true;feedback.setAttribute('role','status');question.append(choices,feedback,next);
  q.options.forEach((text,index)=>{const b=el('button','lesson-choice');b.type='button';b.append(el('span','lesson-choice-letter',String.fromCharCode(65+index)),el('span','',text));b.setAttribute('aria-pressed','false');choices.append(b);
   b.onclick=()=>{
    if(next.disabled===false&&answers[q.id]?.correct)return;
    const correct=index===q.correct,old=answers[q.id];answers[q.id]={choice:index,correct,attempts:(old?.attempts||0)+1,firstCorrect:old?old.firstCorrect:correct};
    for(const n of choices.children){n.removeAttribute('data-answer');n.setAttribute('aria-pressed','false');}b.dataset.answer=correct?'correct':'wrong';b.setAttribute('aria-pressed','true');
    feedback.textContent=correct?(q.explanation||'درست است؛ می‌توانی ادامه بدهی.'):(config.requireCorrect?'این پاسخ درست نیست؛ دوباره تلاش کن.':q.explanation||'پاسخ درست: '+q.options[q.correct]);feedback.dataset.correct=String(correct);next.disabled=config.requireCorrect&&!correct;persist(true);
   };
  });
  next.onclick=()=>{if(next.disabled)return;done.add(q.id);pending=null;question.hidden=true;outline();persist(true);video.play().catch(()=>{warning.hidden=false;warning.textContent='برای ادامه، دکمهٔ پخش ویدیو را لمس کن.';});};
  outline();question.querySelector('button')?.focus({preventScroll:true});question.scrollIntoView({block:'nearest',behavior:'auto'});
 }
 function inspect(){
  clock.textContent=format(video.currentTime)+(Number.isFinite(video.duration)?' / '+format(video.duration):'');bar.value=Number.isFinite(video.duration)&&video.duration>0?video.currentTime/video.duration*100:0;
  if(pending){video.pause();return;}
  const q=config.checkpoints.find(q=>!done.has(q.id)&&q.time<=video.currentTime+.05);
  if(q)ask(q);persist();
 }
 video.addEventListener('timeupdate',inspect);video.addEventListener('seeked',inspect);video.addEventListener('play',()=>{warning.hidden=true;if(pending)video.pause();});video.addEventListener('pause',()=>persist(true));
 video.addEventListener('loadedmetadata',()=>{
  if(config.checkpoints.some(q=>q.time>=video.duration)){warning.hidden=false;warning.textContent='زمان یکی از سؤال‌ها خارج از مدت ویدیو است؛ زمان‌ها را در سازندهٔ درس اصلاح کن.';}
  if(restoreTime>0 && restoreTime<video.duration){video.currentTime=restoreTime;restoreTime=0;}inspect();
 });
 video.addEventListener('error',()=>{warning.hidden=false;warning.textContent='ویدیو پخش نشد. وجود فایل و سازگاری فرمت را بررسی کن؛ MP4 با H.264 یا WebM پیشنهاد می‌شود.';});
 video.addEventListener('ended',()=>{inspect();if(pending)return;result.hidden=false;result.replaceChildren(el('p','lesson-eyebrow','پایان درس'),el('h2','','درس را کامل کردی'),el('p','',Object.values(answers).filter(a=>a.firstCorrect).length+' پاسخ درست در تلاش اول از '+config.checkpoints.length+' سؤال.'));persist(true);});
 reset.onclick=()=>{video.pause();done.clear();for(const k of Object.keys(answers))delete answers[k];pending=null;question.hidden=true;result.hidden=true;video.currentTime=0;outline();persist(true);};
 window.addEventListener('pagehide',()=>{persist(true);video.pause();});outline();
 window.CodePadLesson={video,config,done,answers,inspect};
}
