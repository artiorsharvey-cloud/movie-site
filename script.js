// ---------------------------------------------------------------
// MOVIE SITE
// STAGE 1: log in, upload a movie (video file + details),
//          everyone can see the movies and watch them
// STAGE 2: a modern design: top bar, big hero, poster cards,
//          pop-up windows, and a real upload progress line
// ---------------------------------------------------------------

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

const heroVideo = document.getElementById("hero-video");
const heroLabel = document.getElementById("hero-label");
const heroTitle = document.getElementById("hero-title");
const heroDescription = document.getElementById("hero-description");
const heroButton = document.getElementById("hero-button");

const movieList = document.getElementById("movie-list");
const movieCount = document.getElementById("movie-count");

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

const uploadDialog = document.getElementById("upload-dialog");
const movieForm = document.getElementById("movie-form");
const titleInput = document.getElementById("title-input");
const yearInput = document.getElementById("year-input");
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
const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
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

// Small drawings (icons) used on the cards and buttons.
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9z"/></svg>';

// The text shown in the file boxes before a file is chosen.
const VIDEO_ZONE_TEXT = videoZoneText.textContent;
const POSTER_ZONE_TEXT = posterZoneText.textContent;

// Who is logged in right now. null means nobody.
let currentUser = null;

// The movie shown in the big hero at the top. null means none.
let heroMovie = null;

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

// The address of one still picture from a video.
// "#t=2" tells the browser: show the picture at second 2.
function videoFrameUrl(path) {
  return fileUrl(path) + "#t=2";
}

// ---------------------------------------------------------------
// THE TOP BAR
// ---------------------------------------------------------------
function showHeader() {
  const loggedIn = currentUser !== null;

  openLoginButton.hidden = loggedIn;
  openUploadButton.hidden = !loggedIn;
  myAvatar.hidden = !loggedIn;
  logoutButton.hidden = !loggedIn;

  if (loggedIn) {
    myAvatar.textContent = currentUser.email.charAt(0);
    myAvatar.title = currentUser.email;
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
    return;
  }

  heroLabel.textContent = heroMovie.year ? "Latest upload · " + heroMovie.year : "Latest upload";
  heroTitle.textContent = heroMovie.title;
  heroDescription.textContent = heroMovie.description || "";
  heroButton.innerHTML = PLAY_ICON + "Play";

  // Only change the picture when the movie changed, so it does not flash.
  const frameUrl = videoFrameUrl(heroMovie.video_path);
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
    .select("id, user_id, title, year, description, video_path, poster_path")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Could not load movies:", error);
    showToast("Error: could not load movies. " + error.message);
    return;
  }

  // The newest movie goes in the hero.
  showHero(data[0]);

  movieList.innerHTML = "";
  movieCount.textContent = data.length === 1 ? "1 movie" : data.length + " movies";

  if (data.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No movies yet. Be the first to upload one.";
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
    } else {
      // No poster: show one still picture from the video instead.
      // preload = "metadata" downloads only a tiny part of the file.
      const frame = document.createElement("video");
      frame.src = videoFrameUrl(row.video_path);
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
    // Each card appears a little later than the one before it.
    item.style.animationDelay = Math.min(index, 12) * 40 + "ms";
    item.appendChild(poster);
    item.appendChild(title);

    if (row.year) {
      const year = document.createElement("p");
      year.className = "movie-year";
      year.textContent = row.year;
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
function playMovie(row) {
  playerTitle.textContent = row.title;
  playerYear.textContent = row.year || "";
  playerDescription.textContent = row.description || "";
  playerVideo.src = fileUrl(row.video_path);
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
function megabytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function showChosenVideo() {
  const file = videoInput.files[0];
  videoZoneText.textContent = file ? file.name + " (" + megabytes(file.size) + ")" : VIDEO_ZONE_TEXT;
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
// Two files go to storage, then one row goes to the database.
// ---------------------------------------------------------------

// Send one file to storage.
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

function finishUpload() {
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
    showFormMessage(uploadMessage, "The video must be 50 MB or smaller. This one is " + megabytes(videoFile.size) + ".", true);
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

  uploadButton.disabled = true;
  uploadProgress.hidden = false;
  setUploadProgress(0);

  // Remember what we uploaded, so we can clean up if a later step fails.
  const uploadedPaths = [];

  // STEP 1: upload the video.
  const video = await uploadFile(videoFile, VIDEO_TYPES[videoFile.type], function (fraction) {
    setUploadProgress(fraction);
    showFormMessage(uploadMessage, "Uploading video... " + Math.round(fraction * 100) + "%");
  });

  if (video.error) {
    console.error("Could not upload video:", video.error);
    showFormMessage(uploadMessage, "Could not upload video. " + video.error.message, true);
    finishUpload();
    return;
  }
  uploadedPaths.push(video.path);

  // STEP 2: upload the poster (if there is one).
  let posterPath = null;

  if (posterFile) {
    showFormMessage(uploadMessage, "Uploading poster...");

    const poster = await uploadFile(posterFile, POSTER_TYPES[posterFile.type], function () {});

    if (poster.error) {
      console.error("Could not upload poster:", poster.error);
      showFormMessage(uploadMessage, "Could not upload poster. " + poster.error.message, true);
      await db.storage.from(BUCKET).remove(uploadedPaths);
      finishUpload();
      return;
    }
    posterPath = poster.path;
    uploadedPaths.push(poster.path);
  }

  // STEP 3: save the movie row, with the paths of the files.
  showFormMessage(uploadMessage, "Saving...");

  const { error } = await db.from("movies").insert({
    title: title,
    year: year,
    description: description === "" ? null : description,
    video_path: video.path,
    poster_path: posterPath,
  });

  finishUpload();

  if (error) {
    console.error("Could not save movie:", error);
    showFormMessage(uploadMessage, "Could not save movie. " + error.message, true);
    // The row failed, so do not leave the uploaded files behind.
    await db.storage.from(BUCKET).remove(uploadedPaths);
    return;
  }

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
    const paths = [row.video_path];
    if (row.poster_path) {
      paths.push(row.poster_path);
    }

    const { error: removeError } = await db.storage.from(BUCKET).remove(paths);
    if (removeError) {
      console.error("Movie deleted, but its files were not:", removeError);
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
for (const dialog of [playerDialog, loginDialog, uploadDialog]) {
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog || event.target.closest("[data-close]")) {
      dialog.close();
    }
  });
}

window.addEventListener("scroll", updateHeaderBackground, { passive: true });
updateHeaderBackground();
