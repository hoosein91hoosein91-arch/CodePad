"""Filesystem-based standalone exports: videos are files, never startup JSON blobs."""
import ast
import sys
import base64
import hashlib
import json
import re
from urllib.parse import quote


def safe_name(name):
    if (not isinstance(name,str) or not name or len(name)>240 or name.startswith('/')
            or '\\' in name or ':' in name or any(ord(c)<32 or ord(c)==127 for c in name)
            or any(p in ('','.','..') for p in name.split('/'))):
        raise ValueError('Project paths must stay inside the project')
    return name


def export_settings(project):
    value=project.get('exportSettings') or {}
    if not isinstance(value,dict):raise ValueError('Invalid export settings')
    entry=project['entryFile'].lower()
    python=entry.endswith(('.py','.mix'))
    if python and 'nativePython' not in value:
        roots={f['name'].split('/')[0].removesuffix('.py') for f in project.get('files',[])}
        imports=set()
        for f in project.get('files',[]):
            if not f['name'].endswith('.py'):continue
            try:tree=ast.parse(f['content'])
            except SyntaxError:continue
            for node in ast.walk(tree):
                if isinstance(node,ast.Import):imports.update(a.name.split('.')[0] for a in node.names)
                elif isinstance(node,ast.ImportFrom) and not node.level and node.module:imports.add(node.module.split('.')[0])
        wasm={'cv2','numpy','mediapipe','codepad_tracking','pygame','OpenGL','turtle'}
        allowed=set(sys.stdlib_module_names)|roots|{'PIL','codepad'}
        dynamic=any(re.search(r'\b(?:__import__|import_module|exec|eval)\s*\(',f['content']) for f in project.get('files',[]) if f['name'].endswith('.py'))
        python=not dynamic and not bool(imports&wasm) and imports<=allowed
    python=bool(value.get('nativePython',python))
    files=project.get('files',[])
    legacy=any(re.search(r'\b(?:(?:assetBytes|assetText)\s*\(|(?:jibos|jibOS|JibOS)\b)',f['content']) for f in files)
    fast=entry.endswith(('.html','.htm')) and value.get('fastStart',True) is not False and not legacy
    image=value.get('loadingImage','')
    if image:
        safe_name(image)
        asset=next((a for a in project.get('assets',[]) if a['name']==image),None)
        if not asset or not asset.get('type','').startswith('image/'):
            raise ValueError('The loading-screen image is missing from project assets')
    return {'fastStart':fast,'nativePython':python,'loadingImage':image}


def prepare_bundle(project,binary_assets=None,platform='android'):
    data=binary_assets or {}
    settings=export_settings(project)
    manifest={k:v for k,v in project.items() if k!='assets'}
    manifest['assets']=[]
    manifest['exportSettings']=settings
    files={}
    for source in project['files']:
        name=safe_name(source['name']);files['project/'+name]=source['content'].encode('utf-8')
    for asset in project.get('assets',[]):
        name=safe_name(asset['name'])
        raw=data[name] if asset.get('binary') else base64.b64decode(asset.get('b64',''),validate=True)
        key='project/'+name
        if key in files:raise ValueError('A source file and attachment have the same name: '+name)
        files[key]=raw
        manifest['assets'].append({'name':name,'type':asset['type'],'url':'./project/'+quote(name,safe='/'),'size':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
    launch={'format':'codepad-launch-1','name':project['name'],'platform':platform,
            'entry':'./project/'+quote(project['entryFile'],safe='/'),
            'entryKind':'python' if project['entryFile'].lower().endswith('.py') else 'mix' if project['entryFile'].lower().endswith('.mix') else 'web',
            'fast':settings['fastStart'],'nativePython':settings['nativePython'],
            'image':'./project/'+quote(settings['loadingImage'],safe='/') if settings['loadingImage'] else ''}
    files['runtime.json']=json.dumps(manifest,ensure_ascii=False,separators=(',',':')).encode()
    files['launch.json']=json.dumps(launch,ensure_ascii=False,separators=(',',':')).encode()
    return manifest,launch,files
