const chromium = require('chrome-aws-lambda');
const chromeLauncher = require('chrome-launcher');
const lighthouse = require('lighthouse');
const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch();

if (
  ['AWS_Lambda_nodejs10.x', 'AWS_Lambda_nodejs12.x'].includes(
    process.env.AWS_EXECUTION_ENV
  ) === true
) {
  if (process.env.FONTCONFIG_PATH === undefined) {
    process.env.FONTCONFIG_PATH = '/tmp/aws';
  }

  if (process.env.LD_LIBRARY_PATH === undefined) {
    process.env.LD_LIBRARY_PATH = '/tmp/aws/lib';
  } else if (process.env.LD_LIBRARY_PATH.startsWith('/tmp/aws/lib') !== true) {
    process.env.LD_LIBRARY_PATH = [
      ...new Set(['/tmp/aws/lib', ...process.env.LD_LIBRARY_PATH.split(':')]),
    ].join(':');
  }
}

const titles = {
  firstContentfulPaint: 'First Contentful Paint',
  firstMeaningfulPaint: 'First Meaningful Paint',
  firstCPUIdle: 'First CPU Idle',
  interactive: 'Time to Interactive',
  speedIndex: 'Speed Index',
  observedLastVisualChange: 'Visually complete',
};

const chromeFlags = [
  '--headless',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--no-zygote',
  '--no-sandbox',
  '--single-process',
  '--hide-scrollbars',
];

exports.handler = async function createLighthouse() {
  // const metrics = await audits();

  const metrics = {
    firstContentfulPaint: Math.random * 10,
    firstMeaningfulPaint: Math.random * 10,
    firstCPUIdle: Math.random * 10,
    interactive: Math.random * 10,
    speedIndex: Math.random * 10,
    observedLastVisualChange: Math.random * 10,
  };

  const MetricData = Object.entries(metrics)
    .filter(([id]) => titles[id])
    .map(getMetric);

  await publishMetrics(MetricData);
  return {
    MetricData,
  };
};

async function audits() {
  const chromePath = await chromium.executablePath;
  let metricsResults = {};
  const runs = process.env.NUMBER_OF_AUDITS;
  for (i = 0; i < runs; i++) {
    const metricsValues = await performLighthouseAudit(chromePath);
    const id = metricsValues.firstCPUIdle;
    metricsResults = {
      ...metricsResults,
      [id]: metricsValues,
    };
  }
  return findMedianRun(metricsResults);
}

async function performLighthouseAudit(chromePath) {
  let chrome;
  try {
    chrome = await chromeLauncher.launch({
      chromeFlags,
      chromePath,
    });

    const {
      lhr: {
        audits: { metrics },
      },
    } = await lighthouse(process.env.URL, {
      output: 'json',
      port: chrome.port,
    });

    if (!metrics || !metrics.details || !metrics.details.items) {
      throw new Error('No metrics data');
    }

    await chrome.kill();
    return metrics.details.items[0];
  } catch (error) {
    if (chrome) {
      await chrome.kill();
      throw error;
    }
  }
}

function publishMetrics(MetricData) {
  return new Promise((resolve, reject) => {
    cloudwatch.putMetricData(
      {
        MetricData,
        Namespace: 'Lighthouse',
      },
      (err, data) => {
        if (err) {
          reject(err);
          return;
        }
        console.log('Published metrics to CloudWatch.');
        resolve(data);
      }
    );
  });
}

function getMetric([id, timing]) {
  return {
    MetricName: titles[id],
    Value: Math.max(0, timing / 1000),
    Dimensions: [
      {
        Name: 'Url',
        Value: process.env.URL,
      },
    ],
    StorageResolution: 60,
    Timestamp: new Date(),
    Unit: 'Seconds',
  };
}

function findMedianRun(results) {
  const TTFCPUIDLEValues = Object.keys(results);
  const medianTTFCPUIDLE = median(TTFCPUIDLEValues);
  return results[medianTTFCPUIDLE];
}

function median(values) {
  if (values.length === 1) return values[0];
  values.sort((a, b) => a - b);
  const half = Math.floor(values.length / 2);
  return values[half];
}
