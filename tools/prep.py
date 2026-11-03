import pymupdf, re, json, sys
import os
B=os.path.dirname(os.path.abspath(__file__))
files={m:f'{B}/pdf/SHO_Module_{m}_Course_Book.pdf' for m in (1,2,3,4)}
os.makedirs(f'{B}/src',exist_ok=True)
hdr=re.compile(r'^(\S+)[\n ](.*?)\nSlide (\d+)[–-](\d+) of (\d+)',re.S)
hdr1=re.compile(r'^(\S+)[\n ](.*?)\nSlide (\d+) of (\d+)',re.S)
index=[]
for m,f in files.items():
  d=pymupdf.open(f); chap={}
  for pn in range(len(d)):
    p=d[pn]; bl=p.get_text('blocks')
    top=[b for b in bl if b[1]<40]
    if not top: continue
    t=top[0][4]; mm=hdr.match(t)
    if mm: cid,title,a,b,tot=mm.groups(); a=int(a); b=int(b)
    else:
      mm=hdr1.match(t)
      if not mm: continue
      cid,title,a,tot=mm.groups(); a=int(a); b=None
    title=re.sub(r'\s+',' ',title)
    c=chap.setdefault(cid,{'module':m,'id':cid,'title':title,'total':int(tot),'slides':[]})
    for slot,(n,y0,y1) in enumerate([(a,40,421),(b,421,800)]):
      if n is None: continue
      txt=[]
      for bb in sorted([x for x in bl if y0<=x[1]<y1 and x[1]>=40 and x[1]<800],key=lambda x:(round(x[1]/4),x[0])):
        s=bb[4]
        if 'NIOSH Malaysia' in s or '©' in s: continue
        s=re.sub(r'\s+',' ',s).strip()
        if s: txt.append(s)
      c['slides'].append({'n':n,'page':pn+1,'text':' | '.join(txt)})
  for cid,c in chap.items():
    with open(f'{B}/src/{cid}.txt','w') as o:
      o.write(f"# {cid} {c['title']} ({c['total']} slides)\n")
      for s in c['slides']: o.write(f"[S{s['n']} p{s['page']}] {s['text'] or '(no text)'}\n")
    index.append({'module':m,'id':cid,'title':c['title'],'total':c['total'],'pages':[c['slides'][0]['page'],c['slides'][-1]['page']]})
json.dump(index,open(f'{B}/index.json','w'),indent=0)
for i in index: print(i['module'],i['id'],i['total'],i['pages'],i['title'])
