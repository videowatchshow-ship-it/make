// VM 제어 웹 서버 (가상1번 = win-vm)
// 웹 버튼 -> 이 서버 -> GCP Compute API로 시작/정지
//
// 인증: Cloud Run의 서비스 계정(ADC) 사용 -> 키 파일 필요 없음
// 보호: 환경변수 PANEL_PASSWORD 로 간단한 비밀번호 잠금
//
// 필요 권한: 서비스 계정에 roles/compute.instanceAdmin.v1 (또는 start/stop 권한)

const express = require('express');
const { GoogleAuth } = require('google-auth-library');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PROJECT = process.env.GCP_PROJECT || 'quantum-bonus-455522-b4';
const ZONE = process.env.VM_ZONE || 'asia-northeast3-a';
const VM = process.env.VM_NAME || 'win-vm';
const PASSWORD = process.env.PANEL_PASSWORD || 'changeme';

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

async function gcp(method, action) {
  const client = await auth.getClient();
  const url =
    `https://compute.googleapis.com/compute/v1/projects/${PROJECT}` +
    `/zones/${ZONE}/instances/${VM}` +
    (action ? `/${action}` : '');
  const res = await client.request({ url, method });
  return res.data;
}

function checkAuth(req, res) {
  if ((req.body && req.body.password) !== PASSWORD) {
    res.status(401).json({ ok: false, error: '비밀번호가 틀렸습니다' });
    return false;
  }
  return true;
}

app.post('/api/start', async (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    await gcp('POST', 'start');
    res.json({ ok: true, message: '시작 요청 완료 (1~2분 뒤 접속 가능)' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/stop', async (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    await gcp('POST', 'stop');
    res.json({ ok: true, message: '정지 요청 완료' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.post('/api/status', async (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    const data = await gcp('GET', '');
    const ip =
      data.networkInterfaces?.[0]?.accessConfigs?.[0]?.natIP || '(없음)';
    res.json({ ok: true, status: data.status, ip });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`VM panel listening on ${PORT}`));
