const fs = require('fs');
fetch('http://localhost:3001/api/options/generate', {
  method: 'POST',
  headers: {
    'x-studio-password': 'icc'
  },
  body: new URLSearchParams({
    'optionIds': JSON.stringify(['1','2','3','4','5','6','7'])
  })
}).then(async r => {
  if (!r.ok) {
    const text = await r.text();
    console.error("HTTP ERROR:", r.status, text);
  } else {
    console.log("SUCCESS");
  }
}).catch(console.error);
