# Kuiz SHO

Kuiz interaktif untuk kursus Safety & Health Officer (SHO), Modul 1–4, dalam Bahasa Melayu.

- 4 modul, 60 bab, 20 soalan objektif setiap bab (1,200 soalan)
- Jawapan tersembunyi sehingga butang **Dedah jawapan** ditekan, dengan penerangan dan rujukan slaid (nombor slaid, halaman dan petikan)
- Bunga api apabila jawapan betul
- Kemajuan disimpan dalam pelayar (localStorage)

## Guna

Buka `index.html` terus dalam pelayar, atau aktifkan **GitHub Pages** (Settings → Pages → Deploy from branch → `main` / root). Fail ini berdiri sendiri — tiada pelayan diperlukan.

## Kemas kini soalan

Soalan disimpan dalam `tools/q/<bab>.json`:

```json
{"q": "Soalan", "c": "Jawapan betul", "w": ["Salah 1", "Salah 2", "Salah 3"], "e": "Penerangan", "s": 12}
```

`s` ialah nombor slaid (atau senarai nombor slaid).

Untuk bina semula `index.html`:

```bash
pip install pymupdf
# letak SHO_Module_{1..4}_Course_Book.pdf dalam tools/pdf/ (tidak disimpan dalam repo)
python3 tools/prep.py    # ekstrak teks slaid ke tools/src/
python3 tools/build.py   # semak 20 soalan/bab dan tulis index.html
```
