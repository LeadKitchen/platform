import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

async function signIn(page: Page) {
  test.skip(
    !email || !password,
    "Set E2E_EMAIL and E2E_PASSWORD for authenticated flows",
  );
  await page.goto("/auth/login");
  await page.getByLabel("Email").fill(email ?? "");
  await page.getByLabel("Password").fill(password ?? "");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/"));
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(serious).toEqual([]);
}

test("player can complete and replay a practice dialog", async ({ page }) => {
  await signIn(page);
  await page.goto("/game");
  await expect(
    page.getByRole("heading", { name: /Проведите смену/ }),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.getByLabel("Название команды").fill(`E2E команда ${Date.now()}`);
  await page.getByRole("button", { name: "Начать практику" }).click();
  await expect(
    page.getByRole("heading", { name: "Новая рабочая ситуация" }),
  ).toBeVisible();
  const sessionUrl = page.url();

  await page.getByRole("button", { name: "Начать разговор" }).click();
  await expect(page.getByText("Цель разговора")).toBeVisible();
  await page
    .getByLabel("Сообщение сотруднику")
    .fill("Анна, подготовьте задачу к сроку и расскажите, как вы её поняли.");
  await page.getByRole("button", { name: "Отправить" }).click();
  await expect(
    page.getByText("Черновик сохраняется автоматически"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Завершить разговор" }).click();
  const forceFinish = page.getByRole("button", { name: "Всё равно завершить" });
  await expect(forceFinish).toBeVisible();
  await forceFinish.click();
  await expect(page.getByText("Персональный разбор")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.getByRole("button", { name: "Повторить эту ситуацию" }).click();
  await expect(page.getByText("Цель разговора")).toBeVisible();

  await page.goto(sessionUrl);
  await page.getByRole("button", { name: "Завершить смену" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Завершить смену" })
    .click();
  await expect(page).toHaveURL(/\/game$/);
});

test("authorized admin sees simple analytics and configuration controls", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_ADMIN !== "1",
    "Set E2E_ADMIN=1 when the E2E account has admin access",
  );
  await signIn(page);
  await page.goto("/admin/game/overview");
  await expect(page.getByText("Спросить об аналитике")).toBeVisible();
  await expect(page.getByText("История конфигурации")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
});
