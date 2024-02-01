import process from "process";
import puppeteer from "puppeteer";
import { pipeline as streamPipeline } from "stream/promises";
import fs from "fs";
import got from "got";
import { config } from "dotenv";
config();

const cookies = [{ name: "d", value: process.env.D, domain: ".slack.com" }];

const getExports = async () => {
  const res = await fetch("https://hackclub.slack.com/services/export", {
    method: "GET",
    headers: {
      Cookie: `d=${process.env.D};`,
    },
  });

  const data = await res.text();
  const table = data.match(/<table.*?>([\s\S]*?)<\/table>/)[0];

  const rows = table.match(/<tr.*?>([\s\S]*?)<\/tr>/g);
  const headers = rows[0]
    .match(/<th.*?>([\s\S]*?)<\/th>/g)
    .map((h) => h.match(/<th.*?>([\s\S]*?)<\/th>/)[1]);

  const dataRows = rows.slice(1).map((row) => {
    const cells = row
      .match(/<td.*?>([\s\S]*?)<\/td>/g)
      .map((c) => c.match(/<td.*?>([\s\S]*?)<\/td>/)[1]);

    return headers.reduce((acc, header, i) => {
      if (!header || header === "Type") return acc;

      if (header === "Status") {
        acc[header] = cells[i].match(/<a.*?href="(.*?)"/)?.[1];
      } else acc[header] = cells[i].replace(/<.*?>/g, "");

      return acc;
    }, {});
  });

  return dataRows;
};

const startExport = async () => {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    for (let i = 0; i < cookies.length; i++) {
      await page.setCookie(cookies[i]);
    }

    await page.goto("https://hackclub.slack.com/services/export/");
    console.log("🚀 Navigated to Slack export page");

    await page.waitForSelector('[data-qa="service_export_date_preset"]');
    const select = await page.evaluateHandle(() =>
      document.querySelector('[data-qa="service_export_date_preset"]')
    );
    await select.click();

    console.log("🔍 Clicked on date preset dropdown");

    await page.waitForSelector('[data-qa="service_export_date_preset_option_1"]');
    const sevenDays = await page.evaluateHandle(() =>
      document.querySelector('[data-qa="service_export_date_preset_option_1"]')
    );
    await sevenDays.click();

    console.log("📅 Selected 7 days");

    await page.waitForSelector('[data-qa="service_export_submit"]');
    const submit = await page.evaluateHandle(() =>
      document.querySelector('[data-qa="service_export_submit"]')
    );
    await submit.click();

    console.log("🚀 Started export");

    await Promise.all([
      page.waitForNavigation(),
      page.waitForSelector('[data-qa="service_export_date_preset"]'),
    ]);

    console.log("🎉 Export started");
  } catch (err) {
    console.error(err);
  }
};

const downloadExports = async () => {
  const exports = (await getExports()) || [];

  for (let i = 0; i < exports.length; i++) {
    if (fs.existsSync(`./exports/${exports[i].Status}.zip`)) {
      console.log(`📂 Export ${i + 1} already downloaded`);
      continue;
    }

    console.log(`📥 Downloading export ${i + 1}`);
    await streamPipeline(
      got.stream(exports[i].Status, {
        headers: {
          Cookie: `d=${process.env.D};`,
        },
      }),
      fs.createWriteStream(`./exports/${exports[i].Status}.zip`)
    );

    console.log(`🎉 Export ${i + 1} downloaded`);
  }
};

if (process.argv[2] === "start") {
  startExport().then(() => process.exit(0));
} else if (process.argv[2] === "get") {
  getExports().then((data) => {
    console.log(data);
    process.exit(0);
  });
} else if (process.argv[2] === "download") {
  downloadExports().then(() => process.exit(0));
} else {
  console.log("🚨 Add either 'start' or 'get' as an argument");
  process.exit(0);
}
