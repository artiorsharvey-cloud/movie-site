// ---------------------------------------------------------------
// MOVIE SITE
// STAGE 1: log in, upload a movie (video file + details),
//          everyone can see the movies and watch them
// ---------------------------------------------------------------

// Same Supabase project as the earlier websites.
const SUPABASE_URL = "https://xmkjrncoexgjcyjcaukf.supabase.co";
const SUPABASE_KEY = "sb_publishable_zy4lZL5239LLuA5Cbz1Gew_FNkccaUz";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const message = document.getElementById("message");
const loggedOutSection = document.getElementById("logged-out");
const loggedInSection = document.getElementById("logged-in");
const loginForm = document.getElementById("login-form");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const loginButton = document.getElementById("login-button");
const signupButton = document.getElementById("signup-button");
const logoutButton = document.getElementById("logout-button");
const myEmail = document.getElementById("my-email");
const movieForm = document.getElementById("movie-form");
const titleInput = document.getElementById("title-input");
const yearInput = document.getElementById("year-input");
const descriptionInput = document.getElementById("description-input");
const videoInput = document.getElementById("video-input");
const posterInput = document.getElementById("poster-input");
const uploadButton = document.getElementById("upload-button");
const movieList = document.getElementById("movie-list");
const player = document.getElementById("player");
const playerVideo = document.getElementById("player-video");
const playerTitle = document.getElementById("player-title");
const playerDescription = document.getElementById("player-description");
const playerClose = document.getElementById("player-close");

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

// Who is logged in right now. null means nobody.
let currentUser = null;

// ---------------------------------------------------------------
// SHOW THE RIGHT PART OF THE PAGE
// ---------------------------------------------------------------
function showPage() {
  loggedOutSection.hidden = currentUser !== null;
  loggedInSection.hidden = currentUser === null;
  myEmail.textContent = currentUser ? currentUser.email : "";
}

// Supabase calls this when the page opens and whenever somebody
// logs in or out.
db.auth.onAuthStateChange(function (event, session) {
  currentUser = session ? session.user : null;
  showPage();
  // setTimeout lets Supabase finish its login work before we ask
  // the database anything.
  // Reload the movies too, so the Delete buttons match who is logged in.
  setTimeout(loadMovies, 0);
});

// Turn a path stored in the database into a full web address.
function fileUrl(path) {
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

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
    message.textContent = "Error: could not load movies. " + error.message;
    return;
  }

  movieList.innerHTML = "";

  if (data.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No movies yet.";
    movieList.appendChild(item);
    return;
  }

  for (const row of data) {
    // Build:
    // <li>
    //   <button class="movie-poster"><img></button>
    //   <p class="movie-title">the title</p>
    //   <p class="movie-year">the year</p>
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
      // No poster: show the first letter of the title instead.
      poster.textContent = row.title.charAt(0).toUpperCase();
    }

    poster.addEventListener("click", function () {
      playMovie(row);
    });

    const title = document.createElement("p");
    title.className = "movie-title";
    title.textContent = row.title;

    const item = document.createElement("li");
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
      deleteButton.textContent = "Delete";
      deleteButton.addEventListener("click", function () {
        deleteMovie(row, deleteButton);
      });
      item.appendChild(deleteButton);
    }

    movieList.appendChild(item);
  }
}

// ---------------------------------------------------------------
// WATCH A MOVIE
// The browser does not download the whole video first. It asks
// storage for small pieces as you watch. This is called STREAMING.
// ---------------------------------------------------------------
function playMovie(row) {
  playerTitle.textContent = row.year ? row.title + " (" + row.year + ")" : row.title;
  playerDescription.textContent = row.description || "";
  playerVideo.src = fileUrl(row.video_path);
  player.hidden = false;
  player.scrollIntoView({ behavior: "smooth" });
  playerVideo.play();
}

function closePlayer() {
  playerVideo.pause();
  playerVideo.removeAttribute("src");
  playerVideo.load(); // forget the old video, stop downloading it
  player.hidden = true;
}

// ---------------------------------------------------------------
// UPLOAD A MOVIE
// Two files go to storage, then one row goes to the database.
// ---------------------------------------------------------------
async function uploadFile(file, extension) {
  // The path is: my user id / a random name . the file type
  const path = currentUser.id + "/" + crypto.randomUUID() + "." + extension;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });

  return { path: path, error: error };
}

async function addMovie(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const year = yearInput.value === "" ? null : Number(yearInput.value);
  const videoFile = videoInput.files[0];
  const posterFile = posterInput.files[0];

  if (title === "") {
    message.textContent = "Error: please write a title.";
    return;
  }
  if (!videoFile) {
    message.textContent = "Error: please choose a video file.";
    return;
  }
  if (!VIDEO_TYPES[videoFile.type]) {
    message.textContent = "Error: the video must be an MP4 or WebM file.";
    return;
  }
  if (videoFile.size > MAX_VIDEO_BYTES) {
    message.textContent = "Error: the video must be 50 MB or smaller.";
    return;
  }
  if (posterFile) {
    if (!POSTER_TYPES[posterFile.type]) {
      message.textContent = "Error: the poster must be a JPG, PNG or WebP.";
      return;
    }
    if (posterFile.size > MAX_POSTER_BYTES) {
      message.textContent = "Error: the poster must be 2 MB or smaller.";
      return;
    }
  }

  uploadButton.disabled = true;

  // Remember what we uploaded, so we can clean up if a later step fails.
  const uploadedPaths = [];

  // STEP 1: upload the video.
  message.textContent = "Uploading video... this can take a minute. Keep this page open.";

  const video = await uploadFile(videoFile, VIDEO_TYPES[videoFile.type]);

  if (video.error) {
    console.error("Could not upload video:", video.error);
    message.textContent = "Error: could not upload video. " + video.error.message;
    uploadButton.disabled = false;
    return;
  }
  uploadedPaths.push(video.path);

  // STEP 2: upload the poster (if there is one).
  let posterPath = null;

  if (posterFile) {
    message.textContent = "Uploading poster...";

    const poster = await uploadFile(posterFile, POSTER_TYPES[posterFile.type]);

    if (poster.error) {
      console.error("Could not upload poster:", poster.error);
      message.textContent = "Error: could not upload poster. " + poster.error.message;
      await db.storage.from(BUCKET).remove(uploadedPaths);
      uploadButton.disabled = false;
      return;
    }
    posterPath = poster.path;
    uploadedPaths.push(poster.path);
  }

  // STEP 3: save the movie row, with the paths of the files.
  message.textContent = "Saving...";

  const { error } = await db.from("movies").insert({
    title: title,
    year: year,
    description: description === "" ? null : description,
    video_path: video.path,
    poster_path: posterPath,
  });

  uploadButton.disabled = false;

  if (error) {
    console.error("Could not save movie:", error);
    message.textContent = "Error: could not save movie. " + error.message;
    // The row failed, so do not leave the uploaded files behind.
    await db.storage.from(BUCKET).remove(uploadedPaths);
    return;
  }

  movieForm.reset();
  message.textContent = "Movie uploaded.";
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
    message.textContent = "Error: could not delete movie. " + error.message;
  } else {
    message.textContent = "";

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
  message.textContent = "Creating account...";

  const { data, error } = await db.auth.signUp({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  setLoginButtonsDisabled(false);

  if (error) {
    console.error("Sign up failed:", error);
    message.textContent = "Error: " + error.message;
    return;
  }

  passwordInput.value = "";
  message.textContent = data.session
    ? ""
    : "Account created. Check your email to confirm it, then log in.";
}

async function logIn(event) {
  event.preventDefault();

  setLoginButtonsDisabled(true);
  message.textContent = "Logging in...";

  const { error } = await db.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  setLoginButtonsDisabled(false);

  if (error) {
    console.error("Log in failed:", error);
    message.textContent = "Error: " + error.message;
    return;
  }

  passwordInput.value = "";
  message.textContent = "";
}

async function logOut() {
  const { error } = await db.auth.signOut();

  if (error) {
    console.error("Log out failed:", error);
    message.textContent = "Error: " + error.message;
    return;
  }

  message.textContent = "Logged out.";
}

loginForm.addEventListener("submit", logIn);
signupButton.addEventListener("click", signUp);
logoutButton.addEventListener("click", logOut);
movieForm.addEventListener("submit", addMovie);
playerClose.addEventListener("click", closePlayer);
