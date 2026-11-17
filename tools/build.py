import json, re, random, glob, os, sys, hashlib
B = os.path.dirname(os.path.abspath(__file__))
index = json.load(open(f'{B}/index.json'))
MODS = {1: 'Akta OSH 1994, Peraturan & Perundangan Berkaitan', 2: 'Keselamatan Pekerjaan',
        3: 'Kesihatan & Higien Pekerjaan', 4: 'Pengurusan OSH'}
MODS_EN = {1: 'OSH Act 1994, Its Regulations & Related Legislation', 2: 'Occupational Safety',
           3: 'Occupational Health & Hygiene', 4: 'OSH Management'}
slide_re = re.compile(r'^\[S(\d+) p(\d+)\] (.*)$')
errors = []
out = {'modules': []}
for m in [1, 2, 3, 4]:
    mod = {'n': m, 'title': MODS[m], 'en': MODS_EN[m], 'chapters': []}
    for ch in [c for c in index if c['module'] == m]:
        cid = ch['id']
        slides = {}
        for line in open(f'{B}/src/{cid}.txt'):
            mm = slide_re.match(line.rstrip('\n'))
            if mm:
                slides[int(mm.group(1))] = (int(mm.group(2)), mm.group(3))
        entry = {'id': cid, 'title': ch['title'], 'total': ch['total'], 'qs': []}
        qf = f'{B}/q/{cid}.json'
        # version hashes: saved answers are discarded when a chapter's question set changes
        hv = lambda f: hashlib.md5(json.dumps([[x['q'], x['c']] for x in json.load(open(f))], ensure_ascii=False).encode()).hexdigest()[:8]
        if os.path.exists(qf):
            entry['v'] = hv(qf)
            lf = f'{B}/q_v1/{cid}.json'
            entry['lv'] = hv(lf) if os.path.exists(lf) else entry['v']
        if os.path.exists(qf):
            try:
                qs = json.load(open(qf))
            except Exception as e:
                errors.append(f'{cid}: bad json {e}'); qs = []
            if len(qs) != 20:
                errors.append(f'{cid}: {len(qs)} questions')
            rnd = random.Random(cid)
            for i, q in enumerate(qs):
                opts = [q['c']] + q['w']
                if len(opts) != 4 or len(set(opts)) != 4:
                    errors.append(f'{cid} q{i+1}: options problem')
                order = list(range(len(opts))); rnd.shuffle(order)
                sl = q['s'] if isinstance(q['s'], list) else [q['s']]
                refs = []
                for s in sl:
                    if s not in slides:
                        errors.append(f'{cid} q{i+1}: slide {s} missing'); continue
                    pg, txt = slides[s]
                    ex = txt if len(txt) <= 320 else txt[:317].rsplit(' ', 1)[0] + ' …'
                    refs.append([s, pg, ex])
                entry['qs'].append({'q': q['q'], 'o': [opts[k] for k in order], 'a': order.index(0),
                                    'e': q['e'], 'r': refs})
        mod['chapters'].append(entry)
    out['modules'].append(mod)
tpl = open(f'{B}/template.html').read()
data = json.dumps(out, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
os.makedirs(f'{B}/dist', exist_ok=True)
open(f'{B}/../index.html', 'w').write(tpl.replace('/*__DATA__*/null', data))
done = sum(1 for md in out['modules'] for c in md['chapters'] if c['qs'])
print('chapters with questions:', done, '/', len(index))
print('size KB:', os.path.getsize(f'{B}/../index.html') // 1024)
print('\n'.join(errors) if errors else 'no errors')
