# نمونه‌های هاب (../hub-samples) را به hub-data.js تبدیل می‌کند:  python3 tools/build_hub_data.py
import os,re,json
import pathlib
HERE=pathlib.Path(__file__).resolve().parent
d=str(HERE.parent/'hub-samples')
out=[]
for f in sorted(x for x in os.listdir(d) if x.endswith(('.py','.html'))):
    t=open(os.path.join(d,f),encoding='utf-8').read()
    meta={}
    if f.endswith('.html'):
        m=re.match(r'<!--(.*?)-->\s*',t,re.S)
        if m:
            for line in m.group(1).strip().splitlines():
                k,_,v=line.partition(':'); meta[k.strip()]=v.strip()
            body=t[m.end():]
        else: body=t
        code=t  # keep the header comment as part of file
        ext='html'
    else:
        for line in t.splitlines():
            m=re.match(r'#\s*(title|desc|cat|level):\s*(.*)',line)
            if m: meta[m.group(1)]=m.group(2).strip()
            else: break
        code=t; ext='py'
    cat=f.split('_')[0]
    out.append({'id':f.rsplit('.',1)[0],'file':f,'ext':ext,'cat':meta.get('cat',cat),'title':meta.get('title',f),'desc':meta.get('desc',''),'level':int(meta.get('level',1) or 1),'code':code})
js='// تولید خودکار از hubsamples؛ نمونه‌های آفلاین هاب CodePad\nexport const HUB_SAMPLES = '+json.dumps(out,ensure_ascii=False,indent=1)+';\n'
open(str(HERE.parent/'files/mobile-src/assets/hub-data.js'),'w',encoding='utf-8').write(js)
print(len(out),len(js))
