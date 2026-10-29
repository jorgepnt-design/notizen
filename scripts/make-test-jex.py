# Erzeugt eine kleine Joplin-Exportdatei (.jex) zum Testen des Imports.
# Aufruf: python3 scripts/make-test-jex.py test.jex public/icon-192.png
import tarfile, io, sys
out, png = sys.argv[1], sys.argv[2]
i = lambda n: format(n, '032x')
F, SUB, N1, N2, T, R, NT, N3 = i(11), i(12), i(13), i(14), i(15), i(16), i(17), i(18)
files = {
 f'{F}.md': f'Reisen\n\nid: {F}\ncreated_time: 2023-01-01T10:00:00.000Z\nupdated_time: 2023-01-02T10:00:00.000Z\nparent_id: \ntype_: 2',
 f'{SUB}.md': f'Portugal\n\nid: {SUB}\ncreated_time: 2023-01-01T10:00:00.000Z\nupdated_time: 2023-01-02T10:00:00.000Z\nparent_id: {F}\ntype_: 2',
 f'{N1}.md': f'Packliste Lissabon\n\n## Kleidung\n\n- [x] Sonnenbrille\n- [ ] Regenjacke\n\n![Logo]( :/{R})\n\n![Logo](:/{R})\n\n| Tag | Ort |\n|---|---|\n| 1 | Alfama |\n\nSiehe [Evernote-Notiz](:/{N2}).\n\nid: {N1}\nparent_id: {SUB}\ncreated_time: 2023-03-01T08:00:00.000Z\nupdated_time: 2023-03-05T08:00:00.000Z\nuser_created_time: 2023-03-01T08:00:00.000Z\nuser_updated_time: 2023-03-05T08:00:00.000Z\nis_todo: 0\nmarkup_language: 1\ntype_: 1',
 f'{N2}.md': f'Alte Evernote-Notiz\n\n<div><b>Wichtig:</b> Reisepass verlängern</div><ul><li>Termin Bürgeramt</li></ul>\n\nid: {N2}\nparent_id: {F}\ncreated_time: 2022-05-01T08:00:00.000Z\nupdated_time: 2022-05-01T08:00:00.000Z\nmarkup_language: 2\ntype_: 1',
 f'{N3}.md': f'Gelöschter Entwurf\n\nnicht mehr gebraucht\n\nid: {N3}\nparent_id: {F}\ncreated_time: 2022-05-01T08:00:00.000Z\nupdated_time: 2022-05-01T08:00:00.000Z\ndeleted_time: 1700000000000\nmarkup_language: 1\ntype_: 1',
 f'{T}.md': f'urlaub\n\nid: {T}\ncreated_time: 2023-01-01T10:00:00.000Z\ntype_: 5',
 f'{NT}.md': f'id: {NT}\nnote_id: {N1}\ntag_id: {T}\ntype_: 6',
 f'{R}.md': f'logo.png\n\nid: {R}\nmime: image/png\nfilename: logo.png\nfile_extension: png\ntype_: 4',
}
with tarfile.open(out, 'w', format=tarfile.USTAR_FORMAT) as tf:
    def add(name, data):
        ti = tarfile.TarInfo(name); ti.size = len(data); tf.addfile(ti, io.BytesIO(data))
    for k, v in files.items(): add(k, v.encode())
    add(f'resources/{R}.png', open(png, 'rb').read())
