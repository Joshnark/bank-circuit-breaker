import http from 'k6/http';
import { sleep } from 'k6';

const url = 'https://3qf6pj63m8.execute-api.us-east-1.amazonaws.com/dev/test';

export const options = {
  scenarios: {
    dynamic_payload_scenario: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 140,
      maxDuration: '8m',
    },
  },
};

const now = new Date();
const delay = 60 - now.getSeconds();
if (delay < 60) {
  console.log(`Esperando ${delay} segundos para iniciar en el segundo 00...`);
  sleep(delay);
}

let currentIteration = 0;

export default function () {
  const minute = Math.floor(currentIteration / 20) + 1;

  let errorValue = false;
  if (minute === 1) errorValue = currentIteration % 20 < 5;
  else if (minute === 3) errorValue = currentIteration % 20 < 15;
  else if (minute === 5) errorValue = currentIteration % 20 < 15;

  const payload = JSON.stringify({
    message: 'Test payload with dynamic error',
    timestamp: new Date().toISOString(),
    error: errorValue,
  });

  const headers = { 'Content-Type': 'application/json' };

  const res = http.post(url, payload, { headers });

  console.log(
    `Minute: ${minute}, Iteration: ${currentIteration + 1}, Error: ${errorValue}, Status: ${res.status}, Message: ${res.body}`
  );

  currentIteration++;
  sleep(3);
}
