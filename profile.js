document.addEventListener('DOMContentLoaded', async () => {
  // --- 0. CONFIGURATION ---
  let auth0Client = null;

  // --- 1. GET REFERENCES TO HTML ELEMENTS ---
  const logoutBtn = document.getElementById('logout-btn');
  const saveProfileBtn = document.getElementById('save-profile-btn');
  const resumeText = document.getElementById('resume-text');
  const geminiApiKeyInput = document.getElementById('gemini-api-key');
  const userProfileEl = document.getElementById('user-profile');
  const userDisplayNameEl = document.getElementById('user-display-name');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const mainContent = document.getElementById('main-content');

  // --- 2. DEFINE CORE FUNCTIONS ---
  const configureClient = async () => {
    auth0Client = await auth0.createAuth0Client({
      domain: AUTH_CONFIG.domain,
      clientId: AUTH_CONFIG.clientId,
      cacheLocation: 'localstorage',
    });
  };

  const updateUI = async () => {
    const isAuthenticated = await auth0Client.isAuthenticated();
    userProfileEl.style.display = isAuthenticated ? 'flex' : 'none';
    userProfileEl.style.alignItems = 'center';
    mainContent.style.display = isAuthenticated ? 'block' : 'none';

    if (isAuthenticated) {
      const user = await auth0Client.getUser();
      userDisplayNameEl.textContent = user.name || user.nickname || user.email;
      await loadProfile();
    } else {
      // If not authenticated, redirect to login
      await auth0Client.loginWithRedirect({
        authorizationParams: {
          redirect_uri: window.location.href
        }
      });
    }
  };

  const handleLogout = () => {
    auth0Client.logout({
      logoutParams: {
        returnTo: chrome.runtime.getURL('dashboard.html')
      }
    });
  };

  const openDashboard = () => {
    window.location.href = chrome.runtime.getURL('dashboard.html');
  };

  const saveProfile = async () => {
    const user = await auth0Client.getUser();
    if (!user) return;

    const resume = resumeText.value;
    const geminiApiKey = geminiApiKeyInput.value;

    if (!resume) {
      alert('Please paste your resume text.');
      return;
    }

    const key = `profile_${user.sub}`;
    await chrome.storage.local.set({ [key]: { resume: resume, apiKey: geminiApiKey } });
    alert('Profile saved!');
  };

  const loadProfile = async () => {
    const user = await auth0Client.getUser();
    if (!user) return;

    const key = `profile_${user.sub}`;
    const result = await chrome.storage.local.get([key]);

    if (result[key]) {
      resumeText.value = result[key].resume || '';
      geminiApiKeyInput.value = result[key].apiKey || '';
    }
  };

  const processLogin = async () => {
    const query = window.location.search;
    if (query.includes("code=") && query.includes("state=")) {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, "/profile.html");
    }
  };

  // --- 3. ATTACH EVENT LISTENERS & INITIALIZE ---
  const initialize = async () => {
    await configureClient();
    await processLogin();
    await updateUI();

    logoutBtn.addEventListener('click', handleLogout);
    dashboardBtn.addEventListener('click', openDashboard);
    saveProfileBtn.addEventListener('click', saveProfile);
  };

  initialize();
});