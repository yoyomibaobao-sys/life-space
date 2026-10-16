import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("Android cloud login preserves autofill and supports accessible password visibility", () => {
  const source = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
  const begin = source.indexOf("function CloudLogin(");
  const end = source.indexOf("function ProjectForm(", begin);
  assert.ok(begin >= 0 && end > begin);
  const login = source.slice(begin, end);
  assert.match(login, /loginTitle = language === "zh" \? "帐号登录" : "Sign in"/);
  assert.match(login, /<MobilePageHeaderView title=\{loginTitle\} titleText=\{loginTitle\}/);
  assert.doesNotMatch(login, /<h1>\{copy\.cloudSignIn\}<\/h1>/);
  assert.match(login, /style=\{\{ gridTemplateColumns: "minmax\(0, 1fr\)" \}\}/);
  assert.match(login, /const \[passwordVisible, setPasswordVisible\] = useState\(false\)/);
  assert.match(login, /type=\{passwordVisible \? "text" : "password"\}/);
  assert.match(login, /autoComplete="current-password"/);
  // Android autofill writes directly into the DOM; per-keystroke React value
  // reconciliation must not overwrite that value or disturb keyboard focus.
  assert.match(login, /const emailInputRef = useRef<HTMLInputElement>\(null\)/);
  assert.match(login, /const passwordInputRef = useRef<HTMLInputElement>\(null\)/);
  assert.match(login, /ref=\{emailInputRef\}/);
  assert.match(login, /ref=\{passwordInputRef\}/);
  assert.match(login, /emailInputRef\.current\?\.value\.trim\(\)\.toLowerCase\(\)/);
  assert.match(login, /passwordInputRef\.current\?\.value/);
  assert.match(login, /name="username"/);
  assert.match(login, /autoComplete="username"/);
  assert.match(login, /name="password"/);
  assert.doesNotMatch(login, /value=\{email\}|value=\{password\}/);
  assert.doesNotMatch(login, /onChange=\{\(event\) => set(?:Email|Password)/);
  assert.match(login, /aria-label=\{passwordVisible \? t\.auth\.hide_password : t\.auth\.show_password\}/);
  assert.match(login, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/);
  assert.match(login, /<UiIcon name=\{passwordVisible \? "eye-off" : "eye"\}/);
});


test("Android login keeps one title and the requested compact actions", () => {
  const shell = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
  const login = shell.slice(shell.indexOf("function CloudLogin("), shell.indexOf("function ProjectForm("));
  assert.equal((login.match(/<MobilePageHeaderView /g) || []).length, 1);
  assert.match(login, /showBack ariaLabel=\{copy\.back\} onBack=\{onBack\}/);
  assert.equal((login.match(/loginTitle\}/g) || []).length, 2); // visual title and tooltip
  assert.match(login, /<label[^>]*>\s*<input type="checkbox" checked=\{rememberEmail\}/);
  assert.match(login, /\{t\.auth\.remember_email\}[\s\S]*?<\/label>\s*<button type="button"[\s\S]*?sendPasswordRecovery/);
  assert.match(login, /\{t\.auth\.forgot_password\}/);
  assert.match(login, /<AuthCaptcha\s+interactionOnly\s+action="auth"/);
  assert.match(login, /<button type="submit" className="primary-button"/);
  assert.match(login, /<\/form>\s*<p[^>]*>[\s\S]*?onClick=\{onRegister\}[\s\S]*?\{t\.auth\.register_account\}/);
  assert.match(shell, /<CloudLogin copy=\{copy\} online=\{online\}[\s\S]*?onRegister=\{\(\) => setScreen\(\{ kind: "register" \}\)\}/);
});

test("Android login reuses only the web email preference and blocks QA recovery from production", () => {
  const source = fs.readFileSync("mobile-offline-src/main.tsx", "utf8");
  const login = source.slice(source.indexOf("function CloudLogin("), source.indexOf("function ProjectForm("));
  assert.match(login, /localStorage\.getItem\("remember_email"\)/);
  assert.match(login, /if \(rememberEmail\) window\.localStorage\.setItem\("remember_email", normalizedEmail\)/);
  assert.match(login, /else window\.localStorage\.removeItem\("remember_email"\)/);
  assert.doesNotMatch(login, /localStorage\.(?:setItem|getItem)\([^)]*password/i);
  const safety = login.indexOf('NEXT_PUBLIC_SUPABASE_URL?.replace');
  const recovery = login.indexOf("supabase.auth.resetPasswordForEmail");
  assert.ok(safety > 0 && recovery > safety);
  assert.match(login, /redirectTo: buildAuthEmailRedirect\("recovery"\), captchaToken/);
  const view = fs.readFileSync("components/auth/TurnstileChallengeView.tsx", "utf8");
  assert.match(view, /interactionOnly \? \{ appearance: "interaction-only" as const \} : \{\}/);
  assert.match(view, /callback: \(token\) => onTokenChangeRef\.current\(token\)/);
});
test("password reset continues using existing revealable PasswordInput", () => {
  const source = fs.readFileSync("app/reset-password/page.tsx", "utf8");
  assert.equal((source.match(/<PasswordInput/g) || []).length, 2);
});