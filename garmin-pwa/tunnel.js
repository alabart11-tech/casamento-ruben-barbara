'use strict';

// Inicia o servidor Garmin PWA + Cloudflare Tunnel e mostra QR code no terminal.
// Uso: npm run tunnel
//
// Requer cloudflared instalado: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

const { spawn } = require('child_process');
const qr = require('qrcode-terminal');

const PORT = process.env.PORT || 3000;

// ---- 1. Iniciar servidor ----
const server = spawn('node', ['server.js'], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: process.env,
});

server.stdout.on('data', d => process.stdout.write(d));
server.stderr.on('data', d => process.stderr.write(d));

server.on('exit', code => {
  console.error(`\nServidor terminou (código ${code})`);
  process.exit(code ?? 1);
});

// ---- 2. Aguardar servidor pronto, depois iniciar tunnel ----
let tunnelStarted = false;

server.stdout.on('data', data => {
  if (tunnelStarted) return;
  if (/a correr em|listening|started/i.test(data.toString())) {
    tunnelStarted = true;
    startTunnel();
  }
});

// Fallback: iniciar tunnel após 5s mesmo que o log não seja detetado
setTimeout(() => {
  if (!tunnelStarted) {
    tunnelStarted = true;
    startTunnel();
  }
}, 5000);

function startTunnel() {
  const path = require('path');
  const isWin = process.platform === 'win32';
  // Procura cloudflared.exe na pasta do projeto (Windows) ou no PATH (Mac/Linux)
  const cfBin = isWin ? path.join(__dirname, 'cloudflared.exe') : 'cloudflared';

  const cf = spawn(cfBin, ['tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  cf.on('error', () => {
    console.error('\n❌  cloudflared não encontrado.');
    console.error('   Instala em: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
    console.error('   Mac:  brew install cloudflare/cloudflare/cloudflared');
    console.error('   Linux: consulta o link acima\n');
  });

  const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
  let shown = false;

  function tryParse(data) {
    if (shown) return;
    const text = data.toString();
    const match = text.match(urlRegex);
    if (match) {
      shown = true;
      const url = match[0];
      console.log('\n' + '═'.repeat(52));
      console.log('  ✅  Garmin PWA acessível em qualquer lugar!');
      console.log(`\n  🔗  ${url}\n`);
      console.log('  Escaneia o QR code com o telemóvel:\n');
      qr.generate(url, { small: true });
      console.log('\n  ℹ️   O URL muda a cada reinício (conta grátis).');
      console.log('  Para URL fixo: cloudflare.com/products/tunnel');
      console.log('═'.repeat(52) + '\n');
    }
  }

  cf.stdout.on('data', tryParse);
  cf.stderr.on('data', tryParse);

  cf.on('exit', code => {
    if (code !== 0) {
      console.error(`\ncloudflared terminou (código ${code})`);
    }
  });

  process.on('SIGINT', () => {
    cf.kill();
    server.kill();
    process.exit(0);
  });
}
