document.addEventListener('DOMContentLoaded', async () => {

  // --- 0. CONFIGURATION ---
  let auth0Client = null;
  const auth0Domain = 'slytechie.us.auth0.com';
  const auth0ClientId = 'D0DQmfItzJzwuwS1R7kRqHeUz66xhJXQ';

  // --- 1. GET REFERENCES TO HTML ELEMENTS ---
  // Auth & Profile
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const profileSection = document.getElementById('profile-section');
  const saveProfileBtn = document.getElementById('save-profile-btn');
  const resumeText = document.getElementById('resume-text');
  const geminiApiKeyInput = document.getElementById('gemini-api-key');
  const userProfileEl = document.getElementById('user-profile');
  const userDisplayNameEl = document.getElementById('user-display-name');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const mainContent = document.getElementById('main-content');

  // AI Section
  const questionInput = document.getElementById('question-input');
  const generateAnswerBtn = document.getElementById('generate-answer-btn');
  const generatedAnswerArea = document.getElementById('generated-answer');

  // Application Form & List
  const appForm = document.getElementById('app-form');
  const companyNameInput = document.getElementById('company-name');
  const positionTitleInput = document.getElementById('position-title');
  const locationInput = document.getElementById('location');
  const companyWebsiteInput = document.getElementById('company-website');
  const autoFillBtn = document.getElementById('autofill-btn');

  // Tab Elements
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabContents = document.querySelectorAll('.tab-content');

  // --- 2. CORE FUNCTIONS ---
  /* Configures the Auth0 client. */
  const configureClient = async () => {
    auth0Client = await auth0.createAuth0Client({
      domain: auth0Domain,
      clientId: auth0ClientId,
      cacheLocation: 'localstorage', //session
      authorizationParams: {
        redirect_uri: undefined 
      }
    });
  };

  /* Updates the UI based on the user's authentication state.*/
  const updateUI = async () => {
    const isAuthenticated = await auth0Client.isAuthenticated();

    loginBtn.style.display = isAuthenticated ? 'none' : 'block';
    logoutBtn.style.display = isAuthenticated ? 'block' : 'none';
    dashboardBtn.style.display = isAuthenticated ? 'block' : 'none';
    userProfileEl.style.display = isAuthenticated ? 'inline' : 'none';
    mainContent.style.display = isAuthenticated ? 'block' : 'none';

    if (isAuthenticated) {
      const user = await auth0Client.getUser();
      userDisplayNameEl.textContent = user.name || user.nickname || user.email;
      console.log('Logged in as:', user.email);
      await loadProfile();
    }
  };

  const handleLogin = async () => {
    await auth0Client.loginWithPopup();
    updateUI();
  };

  const handleLogout = () => {
    auth0Client.logout({
      logoutParams: {
        returnTo: chrome.runtime.getURL('dashboard.html')
      }
    });
  };

  const openDashboard = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  };

  // --- PROFILE FUNCTIONS ---

  const saveProfile = async () => {
    const user = await auth0Client.getUser();
    if (!user) return; // Not logged in

    const resume = resumeText.value;
    const geminiApiKey = geminiApiKeyInput.value;

    if (!resume) {
      alert('Please paste your resume text.');
      return;
    }

    // We save the resume NAMESPACED by the user's ID (user.sub)
    // This keeps each user's data separate.
    const key = `profile_${user.sub}`;
    await chrome.storage.local.set({ [key]: { resume: resume, apiKey: geminiApiKey } });
    alert('Profile saved!');
  };

  const loadProfile = async () => {
    const isAuthenticated = await auth0Client.isAuthenticated();
    if (!isAuthenticated) return;

    const user = await auth0Client.getUser();
    const key = `profile_${user.sub}`;
    const result = await chrome.storage.local.get([key]);

    if (result[key] && result[key].resume) {
      resumeText.value = result[key].resume;
      geminiApiKeyInput.value = result[key].apiKey || '';
    }
  };

  const handleGenerateAnswer = async () => {
    const question = questionInput.value;
    const user = await auth0Client.getUser();
    if (!user) return;

    const profileKey = `profile_${user.sub}`;
    const { [profileKey]: profile } = await chrome.storage.local.get([profileKey]);

    if (!profile || !profile.apiKey || !profile.resume) {
      alert('Please save your resume and Gemini API key in your profile first.');
      return;
    }
    if (!question) {
      alert('Please enter a question to generate an answer for.');
      return;
    }

    generatedAnswerArea.value = 'Generating...';
    generateAnswerBtn.disabled = true;

    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${profile.apiKey}`;

    const prompt = `Based on my resume below, answer the following job application question. Keep the answer professional, concise, and tailored to the question.

      My Resume:
      ---
      ${profile.resume}
      ---

      Question: "${question}"

      Answer:`;

    try {
      const response = await fetch(GEMINI_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      if (!response.ok) {
          const errorData = await response.json();
          console.error('API Error Response:', errorData); 
          throw new Error(errorData.error.message || `HTTP error! status: ${response.status}`);
     }
      const data = await response.json();
      const answer = data.candidates[0].content.parts[0].text;
      generatedAnswerArea.value = answer.trim();
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      generatedAnswerArea.value = 'Error: Could not generate an answer. Check the console for details.';
    } finally {
      generateAnswerBtn.disabled = false;
    }
  };
  const handleFormSubmit = async (event) => {
    event.preventDefault();
    const user = await auth0Client.getUser();
    if (!user) return;
    const newApplication = {
      company: companyNameInput.value,
      position: positionTitleInput.value,
      location: locationInput.value,
      website: companyWebsiteInput.value,
      date: new Date().toLocaleDateString(),
      status: 'Applied' // default status for new applications
    };

    const appKey = `applications_${user.sub}`;
    const result = await chrome.storage.local.get([appKey]);
    const currentApplications = result[appKey] || [];
    currentApplications.push(newApplication);

    await chrome.storage.local.set({ [appKey]: currentApplications });
    appForm.reset();
    // Let the user know it was successful
    alert('Application saved! You can view it in your dashboard.');
  };

  const scrapePageForDetails = () => {
    // This function is injected into the page, so it runs in a different context.
    const predefinedCities = [
      "Bangalore", "Chennai", "Mumbai", "Hyderabad", "Bengaluru"
    ];

    const positionElement = document.querySelector('h1');
    const position = positionElement?.innerText || '';

    let company = '';
    const companySelectors = [
      '.top-card-layout__second-subline a', // LinkedIn
      '.app-header-brand__name',            // Greenhouse
      'a[data-testid="job-header-company-name"]', // Indeed
      '.job-details-jobs-unified-top-card__company-name a' // LinkedIn new
    ];
    const companyElement = document.querySelector(companySelectors.join(', '));
    company = companyElement?.innerText || '';

    const bodyText = document.body.innerText;
    const foundCities = predefinedCities.filter(city =>
      bodyText.toLowerCase().includes(city.toLowerCase())
    );
    let location = '';
    if (foundCities.length === 1) {
      location = foundCities[0];
    } else if (foundCities.length > 1) {
      location = '__MULTIPLE__:' + foundCities.join(', ');
    }

    const website = window.location.href;
    return { company, position, location, website };
  };

  const handleAutoFill = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      function: scrapePageForDetails,
    });

    const pageData = results[0].result;
    if (pageData) {
      companyNameInput.value = pageData.company || '';
      positionTitleInput.value = pageData.position || '';
      if (pageData.location && pageData.location.startsWith('__MULTIPLE__')) {
        const options = pageData.location.replace('__MULTIPLE__:', '').split(', ');
        const userChoice = prompt(`Multiple locations found: ${options.join(', ')}.\nPlease enter the correct one:`, options[0]);
        locationInput.value = userChoice || '';
      } else {
        locationInput.value = pageData.location || '';
      }
      companyWebsiteInput.value = pageData.website || '';
    }
  };

  const handleTabClick = (event) => {
    const targetTab = event.currentTarget.dataset.tab;

    tabLinks.forEach(link => {
      link.classList.remove('active');
    });
    event.currentTarget.classList.add('active');

    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === targetTab) {
        content.classList.add('active');
      }
    });
  };

  // --- 3. ATTACH EVENT LISTENERS ---
  appForm.addEventListener('submit', handleFormSubmit);
  autoFillBtn.addEventListener('click', handleAutoFill);
  loginBtn.addEventListener('click', handleLogin);
  logoutBtn.addEventListener('click', handleLogout);
  dashboardBtn.addEventListener('click', openDashboard);
  saveProfileBtn.addEventListener('click', saveProfile);
  generateAnswerBtn.addEventListener('click', handleGenerateAnswer);
  tabLinks.forEach(link => link.addEventListener('click', handleTabClick));

  // --- 4. INITIAL LOAD ---
  await configureClient();
  await updateUI();
});