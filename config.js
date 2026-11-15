// Pengaturan app WMS Tracking. Ganti EXEC_URL kalau Web App Apps Script di-deploy ulang dengan link baru.
window.WMS_TRACK = {
  // link Web App Apps Script (berakhiran /exec), sama dengan wms-operator
  EXEC_URL: 'https://script.google.com/macros/s/AKfycbx2mwZj9gws4yAiTjsGs393DC-UXPzx2cQCni1UY7e6J3N3kQGgIWQvIH-mhRjWTk4a/exec',
  // kode tracking umum (config PUBLIC_TRACK_KEY). Boleh dikosongkan: app juga membaca ?t=KODE dari link yang dibagikan.
  KEY: '',
  NAMA: 'WMS Tracking'
};
