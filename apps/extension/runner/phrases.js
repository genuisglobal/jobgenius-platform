// Centralized phrase lists for ATS detection/confirmation, keyed by intent.
//
// Previously these lists were duplicated inline across dom.js and each adapter
// and were English-only, so any non-English ATS page broke button detection and
// confirmation. Externalizing them (a) gives one place to tune matching and
// (b) seeds a handful of high-frequency non-English equivalents so international
// postings stop hard-failing. All entries are lowercase; callers normalize the
// page text to lowercase before matching.
//
// This global is consumed by runner/dom.js and runner/adapters/* (loaded after
// this file via RUNNER_SCRIPT_FILES). Each consumer keeps an inline English
// fallback so it still works if this file is ever loaded in isolation (e.g. the
// dom.js unit test).
(() => {
  window.JobGeniusPhrases = {
    // "Apply" entry-point buttons.
    apply: [
      "easy apply",
      "apply now",
      "apply on company site",
      "apply on company website",
      "apply",
      "start application",
      "begin application",
      "continue application",
      "continue applying",
      "continue to application",
      "go to application",
      "view application",
      "external apply",
      "visit employer site",
      // es
      "postular",
      "postularme",
      "aplicar",
      "solicitar",
      "enviar solicitud",
      // fr
      "postuler",
      "candidater",
      // de
      "bewerben",
      "jetzt bewerben",
    ],

    // Advance / submit buttons inside an application flow.
    submit: [
      "next",
      "continue",
      "save and continue",
      "proceed",
      "submit application",
      "submit",
      "apply",
      "begin application",
      "review",
      // es
      "enviar",
      "continuar",
      "siguiente",
      // fr
      "envoyer",
      "soumettre",
      "continuer",
      "suivant",
      // de
      "senden",
      "absenden",
      "einreichen",
      "weiter",
    ],

    // Success signals shown on a completed application (matched inside a
    // confined success region — see dom.isConfirmationVisible).
    confirmation: [
      "thank you",
      "application submitted",
      "successfully applied",
      "application received",
      "we have received",
      "application complete",
      "submitted",
      // es
      "gracias",
      "solicitud enviada",
      "hemos recibido tu solicitud",
      // fr
      "merci",
      "candidature envoyée",
      "candidature reçue",
      "nous avons bien reçu",
      // de
      "danke",
      "vielen dank",
      "bewerbung gesendet",
      "bewerbung erhalten",
      "erfolgreich beworben",
    ],

    // Captcha / bot-challenge copy.
    captcha: [
      "verify you are human",
      "prove you're human",
      "complete the captcha",
      "i'm not a robot",
      "i am not a robot",
      "security challenge",
      // es
      "no soy un robot",
      "verifica que eres humano",
      // fr
      "je ne suis pas un robot",
      // de
      "ich bin kein roboter",
    ],

    // Email one-time-code copy.
    otpEmail: [
      "email code",
      "verification code",
      "confirmation code",
      "one-time code",
      "one time code",
      "check your email",
      "sent to your inbox",
    ],

    // Phrases that indicate the code is delivered by phone/SMS, not email.
    otpSms: [
      "sms code",
      "text message code",
      "texted you a code",
      "sent a code to your phone",
      "verification code sent to your phone",
      "phone verification code",
      "enter the code we sent",
    ],

    // Used to disqualify an email-OTP match when the page is clearly SMS-based.
    otpSmsNegative: ["sms", "text message", "texted you", "phone"],

    // Login-wall copy (paired with a visible password field — see
    // dom.hasLoginWall). Kept narrow: generic words like "password" alone
    // would match account-creation steps.
    loginWall: [
      "sign in to",
      "log in to",
      "sign in with",
      "log in with",
      "welcome back",
      "member login",
      "session expired",
      "session has expired",
      "please sign in",
      "please log in",
      // es
      "iniciar sesión",
      "inicia sesión",
      // fr
      "se connecter",
      "connectez-vous",
      // de
      "anmelden",
      "einloggen",
    ],

    // Account-CREATION copy that disqualifies a login-wall match — ATSes like
    // Workday ask new applicants to create an account mid-apply, which also
    // shows a password field but is part of the normal flow, not a lost session.
    loginWallNegative: [
      "create account",
      "create an account",
      "create your account",
      "sign up",
      "register",
      "new user",
      // es
      "crear cuenta",
      "crear una cuenta",
      "regístrate",
      // fr
      "créer un compte",
      "inscrivez-vous",
      // de
      "konto erstellen",
      "registrieren",
    ],
  };
})();
