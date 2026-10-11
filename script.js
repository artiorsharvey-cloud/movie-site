// ---------------------------------------------------------------
// MOVIE SITE
// STAGE 1: log in, upload a movie (video file + details),
//          everyone can see the movies and watch them
// STAGE 2: a modern design: top bar, big hero, poster cards,
//          pop-up windows, and a real upload progress line
// STAGE 3: genres and search
// STAGE 4: big videos (up to 5 GB) go to Cloudflare R2, through
//          our own server code in the functions folder
// STAGE 5: subscriptions. Big movies are only for people who paid.
// ---------------------------------------------------------------

// The price shown on the site.
const PRICE_TEXT = "15,000₮";

// WHERE CUSTOMERS SEND THE MONEY.
// Change these three lines to your real bank details.
const PAYMENT = {
  bank: "Khan Bank",
  account: "0000000000",
  name: "Harvey",
};

// Same Supabase project as the earlier websites.
const SUPABASE_URL = "https://xmkjrncoexgjcyjcaukf.supabase.co";
const SUPABASE_KEY = "sb_publishable_zy4lZL5239LLuA5Cbz1Gew_FNkccaUz";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const message = document.getElementById("message");
const siteHeader = document.getElementById("site-header");
const openLoginButton = document.getElementById("open-login-button");
const openUploadButton = document.getElementById("open-upload-button");
const myAvatar = document.getElementById("my-avatar");
const logoutButton = document.getElementById("logout-button");
const openSubscribeButton = document.getElementById("open-subscribe-button");
const subscriptionStatus = document.getElementById("subscription-status");

const heroVideo = document.getElementById("hero-video");
const heroImage = document.getElementById("hero-image");
const heroLabel = document.getElementById("hero-label");
const heroTitle = document.getElementById("hero-title");
const heroDescription = document.getElementById("hero-description");
const heroButton = document.getElementById("hero-button");

const movieList = document.getElementById("movie-list");
const movieCount = document.getElementById("movie-count");
const searchInput = document.getElementById("search-input");
const genreChips = document.getElementById("genre-chips");

const playerDialog = document.getElementById("player-dialog");
const playerVideo = document.getElementById("player-video");
const playerTitle = document.getElementById("player-title");
const playerYear = document.getElementById("player-year");
const playerDescription = document.getElementById("player-description");
const playerClose = document.getElementById("player-close");

const loginDialog = document.getElementById("login-dialog");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const loginButton = document.getElementById("login-button");
const signupButton = document.getElementById("signup-button");
const loginMessage = document.getElementById("login-message");

const subscribeDialog = document.getElementById("subscribe-dialog");
const payEmail = document.getElementById("pay-email");
const subscribeCheckButton = document.getElementById("subscribe-check-button");
const subscribeMessage = document.getElementById("subscribe-message");

const uploadDialog = document.getElementById("upload-dialog");
const movieForm = document.getElementById("movie-form");
const titleInput = document.getElementById("title-input");
const yearInput = document.getElementById("year-input");
const genreInput = document.getElementById("genre-input");
const descriptionInput = document.getElementById("description-input");
const videoInput = document.getElementById("video-input");
const videoZoneText = document.getElementById("video-zone-text");
const posterInput = document.getElementById("poster-input");
const posterZoneText = document.getElementById("poster-zone-text");
const posterPreview = document.getElementById("poster-preview");
const uploadButton = document.getElementById("upload-button");
const uploadMessage = document.getElementById("upload-message");
const uploadProgress = document.getElementById("upload-progress");
const uploadProgressBar = document.getElementById("upload-progress-bar");

// These must match the limits in supabase-setup.sql
const BUCKET = "movies";
const MAX_VIDEO_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB (also in functions/api)
const MAX_POSTER_BYTES = 2 * 1024 * 1024; // 2 MB
const VIDEO_TYPES = {
  "video/mp4": "mp4",
  "video/webm": "webm",
};
const POSTER_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const GENRES = [
  "Action", "Comedy", "Drama", "Horror", "Sci-Fi",
  "Animation", "Documentary", "Music", "Other",
];

// Small drawings (icons) used on the cards and buttons.
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9z"/></svg>';

// The text shown in the file boxes before a file is chosen.
const VIDEO_ZONE_TEXT = videoZoneText.textContent;
const POSTER_ZONE_TEXT = posterZoneText.textContent;

// Who is logged in right now. null means nobody.
let currentUser = null;

// What the server told us about the logged-in person:
// may they upload, and until when have they paid?
let me = { canUpload: false, subscribedUntil: null };

// The movie shown in the big hero at the top. null means none.
let heroMovie = null;

// Every movie we got from the database. Search and the genre
// buttons pick from this list, without asking the database again.
let allMovies = [];

// The genre button that is pressed. null means "All".
let chosenGenre = null;

// ---------------------------------------------------------------
// SMALL HELPERS
// ---------------------------------------------------------------

// Show a small message at the bottom of the screen for 4 seconds.
let toastTimer = null;

function showToast(text) {
  message.textContent = text;
  message.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    message.classList.remove("visible");
  }, 4000);
}

// Show a message inside a pop-up form. Errors are red.
function showFormMessage(element, text, isError) {
  element.textContent = text;
  element.classList.toggle("error", isError === true);
}

// Turn a path stored in the database into a full web address.
function fileUrl(path) {
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Old small videos are in Supabase Storage and free for everyone.
// New big ones are in Cloudflare R2 and only for subscribers.
function isPaidMovie(row) {
  return row.video_store === "r2";
}

// The address of one still picture from a FREE video.
// "#t=2" tells the browser: show the picture at second 2.
function videoFrameUrl(row) {
  return fileUrl(row.video_path) + "#t=2";
}

// Has this person paid, and is the time not over yet?
function isSubscribed() {
  return me.subscribedUntil !== null && new Date(me.subscribedUntil) > new Date();
}

// The small grey line under a title: "2025 · Drama", "2025", "Drama" or "".
function yearAndGenre(row) {
  return [row.year, row.genre].filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------
// THE TOP BAR
// ---------------------------------------------------------------
function showHeader() {
  const loggedIn = currentUser !== null;

  openLoginButton.hidden = loggedIn;
  openUploadButton.hidden = !me.canUpload;
  myAvatar.hidden = !loggedIn;
  logoutButton.hidden = !loggedIn;

  // Uploaders watch for free, so they see neither of these two.
  const isCustomer = loggedIn && !me.canUpload;
  openSubscribeButton.hidden = !isCustomer || isSubscribed();
  subscriptionStatus.hidden = !isCustomer || !isSubscribed();

  if (loggedIn) {
    myAvatar.textContent = currentUser.email.charAt(0);
    myAvatar.title = currentUser.email;
  }
  if (isSubscribed()) {
    subscriptionStatus.textContent = "Subscribed until " +
      new Date(me.subscribedUntil).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
  }
}

// Ask the server: may I upload, and am I subscribed?
// The browser cannot decide this itself. Anything decided in the
// browser can be changed by the visitor, so the server decides and
// the browser only SHOWS the answer.
async function loadMe() {
  me = { canUpload: false, subscribedUntil: null };

  if (currentUser) {
    try {
      me = await callApi("GET", "me");
    } catch (error) {
      console.error("Could not load your account:", error);
    }
  }

  showHeader();
}

function openSubscribe() {
  payEmail.textContent = currentUser.email;
  showFormMessage(subscribeMessage, "");
  subscribeDialog.showModal();
}

// The "I have paid" button: ask the server again.
async function checkSubscription() {
  subscribeCheckButton.disabled = true;
  showFormMessage(subscribeMessage, "Checking...");

  await loadMe();

  subscribeCheckButton.disabled = false;

  if (isSubscribed()) {
    subscribeDialog.close();
    showToast("You are subscribed. Enjoy the movies!");
  } else {
    showFormMessage(subscribeMessage, "No payment found yet. It can take up to a day after you pay.");
  }
}

// Make the top bar solid after scrolling down a little.
function updateHeaderBackground() {
  siteHeader.classList.toggle("scrolled", window.scrollY > 40);
}

// Open the upload window, or the login window if nobody is logged in.
function openUpload() {
  if (currentUser) {
    uploadDialog.showModal();
  } else {
    loginDialog.showModal();
  }
}

// Supabase calls this when the page opens and whenever somebody
// logs in or out.
db.auth.onAuthStateChange(function (event, session) {
  currentUser = session ? session.user : null;
  showHeader();

  if (currentUser && loginDialog.open) {
    loginDialog.close();
  }

  // setTimeout lets Supabase finish its login work before we ask
  // the database anything.
  // Reload the movies too, so the Delete buttons match who is logged in.
  setTimeout(loadMovies, 0);
  setTimeout(loadMe, 0);
});

// ---------------------------------------------------------------
// THE HERO (the big picture at the top)
// ---------------------------------------------------------------
function showHero(row) {
  heroMovie = row || null;
  heroButton.hidden = false;

  if (!heroMovie) {
    heroLabel.textContent = "";
    heroTitle.textContent = "Your movies, in one place.";
    heroDescription.textContent = "Upload a video and it appears here for everyone to watch.";
    heroButton.textContent = "Upload a movie";
    heroVideo.classList.remove("ready");
    heroVideo.removeAttribute("src");
    heroImage.hidden = true;
    return;
  }

  const details = yearAndGenre(heroMovie);
  heroLabel.textContent = details ? "Latest upload · " + details : "Latest upload";
  heroTitle.textContent = heroMovie.title;
  heroDescription.textContent = heroMovie.description || "";
  heroButton.innerHTML = PLAY_ICON + "Play";

  // The background picture.
  // A free movie shows one still picture from its video.
  // A paid movie must not hand out its video, so it shows its poster,
  // made big and blurry. With no poster, the colored glow stays.
  if (isPaidMovie(heroMovie)) {
    heroVideo.classList.remove("ready");
    heroVideo.removeAttribute("src");
    heroImage.hidden = !heroMovie.poster_path;
    if (heroMovie.poster_path) {
      heroImage.src = fileUrl(heroMovie.poster_path);
    }
    return;
  }

  heroImage.hidden = true;

  // Only change the picture when the movie changed, so it does not flash.
  const frameUrl = videoFrameUrl(heroMovie);
  if (heroVideo.getAttribute("src") !== frameUrl) {
    heroVideo.classList.remove("ready");
    heroVideo.src = frameUrl;
  }
}

// Fade the hero picture in when the browser has it.
heroVideo.addEventListener("loadeddata", function () {
  heroVideo.classList.add("ready");
});

// ---------------------------------------------------------------
// READ THE MOVIES (SELECT)
// ---------------------------------------------------------------
async function loadMovies() {
  const { data, error } = await db
    .from("movies")
    .select("id, user_id, title, year, genre, description, video_path, video_store, poster_path")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Could not load movies:", error);
    showToast("Error: could not load movies. " + error.message);
    return;
  }

  allMovies = data;

  // The newest movie goes in the hero.
  showHero(allMovies[0]);
  showGenreChips();
  showMovies(true);
}

// ---------------------------------------------------------------
// GENRE BUTTONS
// One button for "All", then one for each genre.
// ---------------------------------------------------------------
function showGenreChips() {
  genreChips.innerHTML = "";
  genreChips.hidden = false;

  for (const genre of [null].concat(GENRES)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = genre || "All";
    // aria-pressed tells screen readers (and our CSS) which one is on.
    chip.setAttribute("aria-pressed", String(genre === chosenGenre));
    chip.addEventListener("click", function () {
      chosenGenre = genre;
      showGenreChips();
      showMovies(false);
    });
    genreChips.appendChild(chip);
  }
}

// ---------------------------------------------------------------
// SHOW THE MOVIE CARDS
// Keeps only the movies that match the search box and the chosen
// genre. This is called FILTERING. It happens here in the browser,
// which is fine for a small site. A site with thousands of movies
// would ask the database to filter instead.
// "animate" says if the cards should slide in.
// ---------------------------------------------------------------
function showMovies(animate) {
  const search = searchInput.value.trim().toLowerCase();

  const data = allMovies.filter(function (row) {
    const genreMatches = chosenGenre === null || row.genre === chosenGenre;
    const searchMatches = search === "" || row.title.toLowerCase().includes(search);
    return genreMatches && searchMatches;
  });

  movieList.innerHTML = "";
  movieCount.textContent = data.length === 1 ? "1 movie" : data.length + " movies";

  if (data.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = allMovies.length === 0
      ? "No movies yet. Be the first to upload one."
      : "No movies match. Try another search or genre.";
    movieList.appendChild(item);
    return;
  }

  data.forEach(function (row, index) {
    // Build:
    // <li class="movie-card">
    //   <button class="movie-poster"> picture + play icon </button>
    //   <p class="movie-title">the title</p>
    //   <p class="movie-year">the year</p>
    //   <button class="movie-delete"> trash icon </button>
    // </li>
    const poster = document.createElement("button");
    poster.type = "button";
    poster.className = "movie-poster";
    poster.setAttribute("aria-label", "Watch " + row.title);

    if (row.poster_path) {
      const image = document.createElement("img");
      image.src = fileUrl(row.poster_path);
      image.alt = "";
      image.loading = "lazy"; // only download when scrolled into view
      poster.appendChild(image);
    } else if (isPaidMovie(row)) {
      // No poster, and the video is for subscribers only: show the
      // first letter of the title.
      const letter = document.createElement("span");
      letter.className = "movie-letter";
      letter.textContent = row.title.charAt(0).toUpperCase();
      poster.appendChild(letter);
    } else {
      // No poster: show one still picture from the video instead.
      // preload = "metadata" downloads only a tiny part of the file.
      const frame = document.createElement("video");
      frame.src = videoFrameUrl(row);
      frame.preload = "metadata";
      frame.muted = true;
      frame.playsInline = true;
      frame.tabIndex = -1;
      poster.appendChild(frame);
    }

    const play = document.createElement("span");
    play.className = "movie-play";
    play.innerHTML = PLAY_ICON;
    poster.appendChild(play);

    poster.addEventListener("click", function () {
      playMovie(row);
    });

    const title = document.createElement("p");
    title.className = "movie-title";
    title.textContent = row.title;

    const item = document.createElement("li");
    item.className = "movie-card";
    if (animate) {
      // Each card appears a little later than the one before it.
      item.style.animationDelay = Math.min(index, 12) * 40 + "ms";
    } else {
      // No sliding while you type in the search box.
      item.style.animation = "none";
    }
    item.appendChild(poster);
    item.appendChild(title);

    const details = yearAndGenre(row);
    if (details) {
      const year = document.createElement("p");
      year.className = "movie-year";
      year.textContent = details;
      item.appendChild(year);
    }

    // Show a Delete button only on MY movies.
    // This "if" is only for a tidy screen. The real protection is the
    // database policy.
    if (currentUser && row.user_id === currentUser.id) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "movie-delete";
      deleteButton.setAttribute("aria-label", "Delete " + row.title);
      deleteButton.title = "Delete";
      deleteButton.innerHTML = TRASH_ICON;
      deleteButton.addEventListener("click", function () {
        deleteMovie(row, deleteButton);
      });
      item.appendChild(deleteButton);
    }

    movieList.appendChild(item);
  });
}

// ---------------------------------------------------------------
// WATCH A MOVIE
// The browser does not download the whole video first. It asks
// storage for small pieces as you watch. This is called STREAMING.
// ---------------------------------------------------------------
async function playMovie(row) {
  let address = null;

  if (isPaidMovie(row)) {
    if (!currentUser) {
      showFormMessage(loginMessage, "Sign in to watch this movie.");
      loginDialog.showModal();
      return;
    }

    // Ask the server for a watching link. The server checks the
    // subscription. The link works for a few hours.
    try {
      const answer = await callApi("POST", "play", { key: row.video_path });
      address = answer.url;
    } catch (error) {
      // 402 means "payment required".
      if (error.status === 402) {
        openSubscribe();
      } else {
        console.error("Could not open movie:", error);
        showToast("Error: " + error.message);
      }
      return;
    }
  } else {
    address = fileUrl(row.video_path);
  }

  playerTitle.textContent = row.title;
  playerYear.textContent = yearAndGenre(row);
  playerDescription.textContent = row.description || "";
  playerVideo.src = address;
  playerDialog.showModal();
  // play() can be refused by the browser. Then the visitor just
  // presses the play button themselves.
  playerVideo.play().catch(function () {});
}

// Runs whenever the player window closes: by the X button, by the
// Esc key, or by a click on the dark background.
function stopPlayer() {
  playerVideo.pause();
  playerVideo.removeAttribute("src");
  playerVideo.load(); // forget the old video, stop downloading it
}

// ---------------------------------------------------------------
// THE FILE BOXES IN THE UPLOAD WINDOW
// ---------------------------------------------------------------
function fileSize(bytes) {
  const megabytes = bytes / 1024 / 1024;
  if (megabytes >= 1024) {
    return (megabytes / 1024).toFixed(2) + " GB";
  }
  return megabytes.toFixed(1) + " MB";
}

function showChosenVideo() {
  const file = videoInput.files[0];
  videoZoneText.textContent = file ? file.name + " (" + fileSize(file.size) + ")" : VIDEO_ZONE_TEXT;
  videoInput.parentElement.classList.toggle("has-file", Boolean(file));

  // Helpful: use the file name as the title if the title is empty.
  if (file && titleInput.value.trim() === "") {
    titleInput.value = file.name.replace(/\.[^.]+$/, "").slice(0, 100);
  }
}

function showChosenPoster() {
  const file = posterInput.files[0];
  posterZoneText.textContent = file ? file.name : POSTER_ZONE_TEXT;
  posterInput.parentElement.classList.toggle("has-file", Boolean(file));

  // Show a small preview of the chosen picture.
  if (posterPreview.src) {
    URL.revokeObjectURL(posterPreview.src);
    posterPreview.removeAttribute("src");
  }
  posterPreview.hidden = !file;
  if (file) {
    posterPreview.src = URL.createObjectURL(file);
  }
}

function setUploadProgress(fraction) {
  uploadProgressBar.style.width = Math.round(fraction * 100) + "%";
}

// ---------------------------------------------------------------
// UPLOAD A MOVIE
// The video goes to Cloudflare R2, the poster goes to Supabase
// Storage, then one row goes to the database.
// ---------------------------------------------------------------

// Send one small file (the poster) to Supabase Storage.
// Before, we used db.storage.upload(). It works, but it cannot tell
// us how far the upload is. XMLHttpRequest is an older browser tool
// that CAN, so we talk to the storage address ourselves here.
// onProgress is called many times with a number from 0 to 1.
async function uploadFile(file, extension, onProgress) {
  // The path is: my user id / a random name . the file type
  const path = currentUser.id + "/" + crypto.randomUUID() + "." + extension;

  // The access token proves to storage who is logged in.
  const { data } = await db.auth.getSession();
  if (!data.session) {
    return { path: path, error: new Error("You are logged out. Please log in again.") };
  }

  return new Promise(function (resolve) {
    const request = new XMLHttpRequest();
    request.open("POST", SUPABASE_URL + "/storage/v1/object/" + BUCKET + "/" + path);
    request.setRequestHeader("Authorization", "Bearer " + data.session.access_token);
    request.setRequestHeader("apikey", SUPABASE_KEY);
    request.setRequestHeader("x-upsert", "false"); // never overwrite a file

    request.upload.addEventListener("progress", function (event) {
      if (event.lengthComputable) {
        onProgress(event.loaded / event.total);
      }
    });

    request.addEventListener("load", function () {
      // A status from 200 to 299 means "it worked".
      if (request.status >= 200 && request.status < 300) {
        resolve({ path: path, error: null });
        return;
      }

      let reason = "The server said: " + request.status;
      try {
        reason = JSON.parse(request.responseText).message || reason;
      } catch (parseError) {
        // The answer was not JSON. Keep the simple reason.
      }
      resolve({ path: path, error: new Error(reason) });
    });

    request.addEventListener("error", function () {
      resolve({ path: path, error: new Error("Network problem. Check your internet.") });
    });

    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    request.send(body);
  });
}

// ---------------------------------------------------------------
// BIG VIDEOS: talk to our own server code (the functions folder)
// ---------------------------------------------------------------

// The access token proves to the server who is logged in.
// Supabase swaps it for a fresh one about once an hour, so we ask
// for it again before every request. A big upload can take longer
// than an hour.
async function accessToken() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    throw new Error("You are logged out. Please log in again.");
  }
  return data.session.access_token;
}

// Send a small question to /api/... and get the answer back.
async function callApi(method, path, body) {
  const response = await fetch("/api/" + path, {
    method: method,
    headers: {
      Authorization: "Bearer " + (await accessToken()),
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let answer = {};
  try {
    answer = await response.json();
  } catch (parseError) {
    // The answer was not JSON. Keep the empty answer.
  }

  if (!response.ok) {
    const error = new Error(answer.message || "The server said: " + response.status);
    error.status = response.status; // so the caller can tell 402 from 500
    throw error;
  }
  return answer;
}

// Send ONE piece of the video. onProgress gets the bytes sent so far.
function sendPart(address, token, piece, onProgress) {
  return new Promise(function (resolve, reject) {
    const request = new XMLHttpRequest();
    request.open("PUT", address);
    request.setRequestHeader("Authorization", "Bearer " + token);

    request.upload.addEventListener("progress", function (event) {
      onProgress(event.loaded);
    });

    request.addEventListener("load", function () {
      let answer = {};
      try {
        answer = JSON.parse(request.responseText);
      } catch (parseError) {
        // The answer was not JSON. Keep the empty answer.
      }

      if (request.status >= 200 && request.status < 300) {
        resolve(answer);
      } else {
        const error = new Error(answer.message || "The server said: " + request.status);
        // 401 and 403 mean "you may not do this". Trying again will
        // not help, so remember not to.
        error.giveUp = request.status === 401 || request.status === 403;
        reject(error);
      }
    });

    request.addEventListener("error", function () {
      reject(new Error("Network problem. Check your internet."));
    });

    request.send(piece);
  });
}

function wait(milliseconds) {
  return new Promise(function (resolve) {
    setTimeout(resolve, milliseconds);
  });
}

// Send the whole video, piece by piece. See functions/api for the
// server side of this. onProgress gets the total bytes sent so far.
async function uploadBigVideo(file, onProgress) {
  let started = null;

  try {
    // 1. Ask the server to start. It answers with the file's path,
    //    an upload id, and how big each piece must be.
    started = await callApi("POST", "upload/start", {
      contentType: file.type,
      size: file.size,
    });

    // 2. Send the pieces, one after another.
    const pieceCount = Math.ceil(file.size / started.partSize);
    const parts = [];

    for (let number = 1; number <= pieceCount; number++) {
      const begin = (number - 1) * started.partSize;
      // slice() cuts one piece out of the file. It does not load the
      // file into memory, so even 4 GB is fine.
      const piece = file.slice(begin, begin + started.partSize);
      const address =
        "/api/upload/part?key=" + encodeURIComponent(started.key) +
        "&uploadId=" + encodeURIComponent(started.uploadId) +
        "&partNumber=" + number;

      // The internet can hiccup during a long upload. If a piece
      // fails, wait a little and send the same piece again.
      for (let attempt = 1; ; attempt++) {
        try {
          const part = await sendPart(address, await accessToken(), piece, function (sent) {
            onProgress(begin + sent);
          });
          parts.push(part);
          break;
        } catch (error) {
          if (error.giveUp || attempt === 4) {
            throw error;
          }
          await wait(attempt * 2000);
        }
      }
    }

    // 3. Tell the server it has all the pieces.
    await callApi("POST", "upload/complete", {
      key: started.key,
      uploadId: started.uploadId,
      parts: parts,
    });

    return { path: started.key, error: null };
  } catch (error) {
    // Throw away the pieces that did arrive. Unfinished uploads
    // still take up space in the bucket.
    if (started) {
      try {
        await callApi("POST", "upload/abort", { key: started.key, uploadId: started.uploadId });
      } catch (abortError) {
        console.error("Could not cancel the upload:", abortError);
      }
    }

    // Opened by double-click, the page has no server behind it.
    if (location.protocol === "file:") {
      return { path: null, error: new Error("Uploading only works on the live site (pages.dev), not on a file opened from your computer.") };
    }
    return { path: null, error: error };
  }
}

// Delete a video from R2. Used when a movie is deleted, or when
// saving the movie row failed after the upload.
async function deleteBigVideo(path) {
  try {
    await callApi("DELETE", "file?key=" + encodeURIComponent(path));
  } catch (error) {
    console.error("Could not delete the video file:", error);
  }
}

// True while a movie is uploading.
let uploading = false;

// Ask "are you sure?" if the tab is closed in the middle of an upload.
window.addEventListener("beforeunload", function (event) {
  if (uploading) {
    event.preventDefault();
  }
});

function finishUpload() {
  uploading = false;
  uploadButton.disabled = false;
  uploadProgress.hidden = true;
  setUploadProgress(0);
}

async function addMovie(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const year = yearInput.value === "" ? null : Number(yearInput.value);
  const videoFile = videoInput.files[0];
  const posterFile = posterInput.files[0];

  if (title === "") {
    showFormMessage(uploadMessage, "Please write a title.", true);
    return;
  }
  if (!videoFile) {
    showFormMessage(uploadMessage, "Please choose a video file.", true);
    return;
  }
  if (!VIDEO_TYPES[videoFile.type]) {
    showFormMessage(uploadMessage, "The video must be an MP4 or WebM file.", true);
    return;
  }
  if (videoFile.size > MAX_VIDEO_BYTES) {
    showFormMessage(uploadMessage, "The video must be 5 GB or smaller. This one is " + fileSize(videoFile.size) + ".", true);
    return;
  }
  if (posterFile) {
    if (!POSTER_TYPES[posterFile.type]) {
      showFormMessage(uploadMessage, "The poster must be a JPG, PNG or WebP.", true);
      return;
    }
    if (posterFile.size > MAX_POSTER_BYTES) {
      showFormMessage(uploadMessage, "The poster must be 2 MB or smaller.", true);
      return;
    }
  }

  uploading = true;
  uploadButton.disabled = true;
  uploadProgress.hidden = false;
  setUploadProgress(0);
  showFormMessage(uploadMessage, "Starting upload...");

  // STEP 1: upload the video to Cloudflare R2, piece by piece.
  const video = await uploadBigVideo(videoFile, function (sentBytes) {
    const fraction = sentBytes / videoFile.size;
    setUploadProgress(fraction);
    showFormMessage(
      uploadMessage,
      "Uploading video... " + Math.floor(fraction * 100) + "% (" +
        fileSize(sentBytes) + " of " + fileSize(videoFile.size) + "). Keep this page open."
    );
  });

  if (video.error) {
    console.error("Could not upload video:", video.error);
    showFormMessage(uploadMessage, "Could not upload video. " + video.error.message, true);
    finishUpload();
    return;
  }

  // STEP 2: upload the poster to Supabase Storage (if there is one).
  let posterPath = null;

  if (posterFile) {
    showFormMessage(uploadMessage, "Uploading poster...");

    const poster = await uploadFile(posterFile, POSTER_TYPES[posterFile.type], function () {});

    if (poster.error) {
      console.error("Could not upload poster:", poster.error);
      showFormMessage(uploadMessage, "Could not upload poster. " + poster.error.message, true);
      await deleteBigVideo(video.path);
      finishUpload();
      return;
    }
    posterPath = poster.path;
  }

  // STEP 3: save the movie row, with the paths of the files.
  showFormMessage(uploadMessage, "Saving...");

  const { error } = await db.from("movies").insert({
    title: title,
    year: year,
    genre: genreInput.value === "" ? null : genreInput.value,
    description: description === "" ? null : description,
    video_path: video.path,
    video_store: "r2",
    poster_path: posterPath,
  });

  if (error) {
    console.error("Could not save movie:", error);
    showFormMessage(uploadMessage, "Could not save movie. " + error.message, true);
    // The row failed, so do not leave the uploaded files behind.
    await deleteBigVideo(video.path);
    if (posterPath) {
      await db.storage.from(BUCKET).remove([posterPath]);
    }
    finishUpload();
    return;
  }

  finishUpload();

  movieForm.reset();
  showChosenVideo();
  showChosenPoster();
  showFormMessage(uploadMessage, "");
  uploadDialog.close();
  showToast("Movie uploaded.");
  await loadMovies();
}

// ---------------------------------------------------------------
// DELETE A MOVIE
// ---------------------------------------------------------------
async function deleteMovie(row, button) {
  if (!confirm('Delete "' + row.title + '"?')) {
    return;
  }

  button.disabled = true;

  const { error } = await db.from("movies").delete().eq("id", row.id);

  if (error) {
    console.error("Could not delete movie:", error);
    showToast("Error: could not delete movie. " + error.message);
  } else {
    showToast("Movie deleted.");

    // The files are separate from the row, so we remove them ourselves.
    // The poster is always in Supabase Storage. The video is there
    // too if it is an old one; new videos are in Cloudflare R2.
    const paths = [];
    if (row.poster_path) {
      paths.push(row.poster_path);
    }

    if (row.video_store === "r2") {
      await deleteBigVideo(row.video_path);
    } else {
      paths.push(row.video_path);
    }

    if (paths.length > 0) {
      const { error: removeError } = await db.storage.from(BUCKET).remove(paths);
      if (removeError) {
        console.error("Movie deleted, but its files were not:", removeError);
      }
    }
  }

  await loadMovies();
}

// ---------------------------------------------------------------
// SIGN UP, LOG IN, LOG OUT (same as the message board)
// ---------------------------------------------------------------
function setLoginButtonsDisabled(disabled) {
  loginButton.disabled = disabled;
  signupButton.disabled = disabled;
}

async function signUp() {
  if (!loginForm.reportValidity()) {
    return;
  }

  setLoginButtonsDisabled(true);
  showFormMessage(loginMessage, "Creating account...");

  const { data, error } = await db.auth.signUp({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  setLoginButtonsDisabled(false);

  if (error) {
    console.error("Sign up failed:", error);
    showFormMessage(loginMessage, error.message, true);
    return;
  }

  passwordInput.value = "";
  showFormMessage(
    loginMessage,
    data.session ? "" : "Account created. Check your email to confirm it, then log in."
  );
}

async function logIn(event) {
  event.preventDefault();

  setLoginButtonsDisabled(true);
  showFormMessage(loginMessage, "Logging in...");

  const { error } = await db.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  setLoginButtonsDisabled(false);

  if (error) {
    console.error("Log in failed:", error);
    showFormMessage(loginMessage, error.message, true);
    return;
  }

  // The login window closes itself in onAuthStateChange above.
  passwordInput.value = "";
  showFormMessage(loginMessage, "");
}

async function logOut() {
  const { error } = await db.auth.signOut();

  if (error) {
    console.error("Log out failed:", error);
    showToast("Error: " + error.message);
    return;
  }

  showToast("Logged out.");
}

// ---------------------------------------------------------------
// CONNECT THE BUTTONS
// ---------------------------------------------------------------
loginForm.addEventListener("submit", logIn);
signupButton.addEventListener("click", signUp);
logoutButton.addEventListener("click", logOut);
movieForm.addEventListener("submit", addMovie);
videoInput.addEventListener("change", showChosenVideo);
posterInput.addEventListener("change", showChosenPoster);

openLoginButton.addEventListener("click", function () {
  loginDialog.showModal();
});
openUploadButton.addEventListener("click", openUpload);
openSubscribeButton.addEventListener("click", openSubscribe);
subscribeCheckButton.addEventListener("click", checkSubscription);

// Put the price and the bank details into the Subscribe window.
for (const element of document.querySelectorAll(".price-text")) {
  element.textContent = PRICE_TEXT;
}
document.getElementById("pay-bank").textContent = PAYMENT.bank;
document.getElementById("pay-account").textContent = PAYMENT.account;
document.getElementById("pay-name").textContent = PAYMENT.name;

// The big hero button plays the newest movie. With no movies, it
// opens the upload window instead.
heroButton.addEventListener("click", function () {
  if (heroMovie) {
    playMovie(heroMovie);
  } else {
    openUpload();
  }
});

playerClose.addEventListener("click", function () {
  playerDialog.close();
});
playerDialog.addEventListener("close", stopPlayer);

// For every pop-up window: the X button closes it, and so does a
// click on the dark background around it.
for (const dialog of [playerDialog, loginDialog, uploadDialog, subscribeDialog]) {
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog || event.target.closest("[data-close]")) {
      dialog.close();
    }
  });
}

// "input" fires on every letter typed in the search box.
searchInput.addEventListener("input", function () {
  showMovies(false);
});

// Fill the Genre list in the upload window from GENRES.
for (const genre of GENRES) {
  const option = document.createElement("option");
  option.value = genre;
  option.textContent = genre;
  genreInput.appendChild(option);
}

window.addEventListener("scroll", updateHeaderBackground, { passive: true });
updateHeaderBackground();
