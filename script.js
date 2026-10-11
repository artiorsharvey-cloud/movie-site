// ---------------------------------------------------------------
// MOVIE SITE
// STAGE 1: log in, upload a movie, everyone can see the list
// STAGE 2: a modern design
// STAGE 3: genres and search
// STAGE 4: big videos (up to 5 GB) go to Cloudflare R2, through
//          our own server code in the functions folder
// STAGE 5: subscriptions. Big movies are only for people who paid.
// STAGE 6: a real movie shop: membership plans, renting one movie,
//          orders with a payment code, likes, ratings, an admin
//          window, a hero that changes, light and dark colors.
// ---------------------------------------------------------------

// WHERE CUSTOMERS SEND THE MONEY.
// Change these three lines if your bank details change.
const PAYMENT = {
  bank: "Khan Bank",
  account: "7005005244142000",
  name: "Byambagaraw Erdenebat",
};

// A rented movie can be watched for this long. The real rule is in
// supabase-setup.sql (confirm_order); this number is only for words
// on the screen.
const RENT_HOURS = 72;

// Same Supabase project as the earlier websites.
const SUPABASE_URL = "https://xmkjrncoexgjcyjcaukf.supabase.co";
const SUPABASE_KEY = "sb_publishable_zy4lZL5239LLuA5Cbz1Gew_FNkccaUz";

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
  "Түүхэн", "Орчин үеийн", "Монгол", "Азийн драма", "Драм",
  "Тулаант", "Аймшиг", "Инээдмийн", "Романтик", "Триллер",
  "Адал явдал", "Хүүхдийн", "Баримтат", "Бусад",
];

// How many movies take turns in the hero, and how long each stays.
const HERO_COUNT = 8;
const HERO_SECONDS = 8;

// Small drawings (icons).
const PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

// A shortcut: $("some-id") finds the element with that id.
function $(id) {
  return document.getElementById(id);
}

const message = $("message");
const searchInput = $("search-input");
const themeButton = $("theme-button");
const openLoginButton = $("open-login-button");
const openAdminButton = $("open-admin-button");
const adminCount = $("admin-count");
const openUploadButton = $("open-upload-button");
const myAvatar = $("my-avatar");
const logoutButton = $("logout-button");

const planTabs = $("plan-tabs");
const planBadge = $("plan-badge");
const planOldPrice = $("plan-old-price");
const planPrice = $("plan-price");
const planPerDay = $("plan-per-day");
const planStatus = $("plan-status");
const planBuyButton = $("plan-buy-button");

const hero = $("hero");
const heroBackdrop = $("hero-backdrop");
const heroContent = hero.querySelector(".hero-content");
const heroLabel = $("hero-label");
const heroTitle = $("hero-title");
const heroDescription = $("hero-description");
const heroMeta = $("hero-meta");
const heroButton = $("hero-button");
const heroMoreButton = $("hero-more-button");
const heroPoster = $("hero-poster");
const heroPrevious = $("hero-previous");
const heroNext = $("hero-next");
const heroDots = $("hero-dots");

const genreChips = $("genre-chips");
const rowsBox = $("rows");
const gridHeading = $("grid-heading");
const movieCount = $("movie-count");
const movieList = $("movie-list");

const movieDialog = $("movie-dialog");
const moviePoster = $("movie-poster");
const movieGenre = $("movie-genre");
const movieTitle = $("movie-title");
const movieMeta = $("movie-meta");
const movieDescription = $("movie-description");
const movieAccess = $("movie-access");
const movieWatchButton = $("movie-watch-button");
const movieRentButton = $("movie-rent-button");
const moviePlanButton = $("movie-plan-button");
const movieLikeButton = $("movie-like-button");
const movieLikeCount = $("movie-like-count");
const movieStars = $("movie-stars");
const movieDeleteButton = $("movie-delete-button");

const playerDialog = $("player-dialog");
const playerVideo = $("player-video");
const playerTitle = $("player-title");
const playerMeta = $("player-meta");

const loginDialog = $("login-dialog");
const loginForm = $("login-form");
const emailInput = $("email-input");
const passwordInput = $("password-input");
const loginButton = $("login-button");
const signupButton = $("signup-button");
const loginMessage = $("login-message");

const orderDialog = $("order-dialog");
const orderItem = $("order-item");
const orderAmount = $("order-amount");
const orderCode = $("order-code");
const orderCopyButton = $("order-copy-button");
const orderMessage = $("order-message");
const orderCheckButton = $("order-check-button");
const orderCancelButton = $("order-cancel-button");

const adminDialog = $("admin-dialog");
const adminMessage = $("admin-message");
const adminPending = $("admin-pending");
const adminDone = $("admin-done");

const uploadDialog = $("upload-dialog");
const movieForm = $("movie-form");
const titleInput = $("title-input");
const yearInput = $("year-input");
const genreInput = $("genre-input");
const priceInput = $("price-input");
const durationInput = $("duration-input");
const descriptionInput = $("description-input");
const videoInput = $("video-input");
const videoZoneText = $("video-zone-text");
const posterInput = $("poster-input");
const posterZoneText = $("poster-zone-text");
const posterPreview = $("poster-preview");
const uploadButton = $("upload-button");
const uploadMessage = $("upload-message");
const uploadProgress = $("upload-progress");
const uploadProgressBar = $("upload-progress-bar");

// The text shown in the file boxes before a file is chosen.
const VIDEO_ZONE_TEXT = videoZoneText.textContent;
const POSTER_ZONE_TEXT = posterZoneText.textContent;

// ---------------------------------------------------------------
// WHAT THE PAGE REMEMBERS (its "state")
// ---------------------------------------------------------------

// Who is logged in right now. null means nobody.
let currentUser = null;

// What the logged-in person may do. Filled in by loadAccount().
// This is only for SHOWING the right buttons. The real checks are
// in the database and in the server code.
let account = emptyAccount();

function emptyAccount() {
  return {
    isAdmin: false,
    subscribedUntil: null, // a Date, or null
    rentals: {},           // movie id -> Date when the rental ends
    likes: {},             // movie id -> true
    ratings: {},           // movie id -> my score, 1 to 10
  };
}

let allMovies = [];        // every movie from the database
let plans = [];            // the membership plans
let chosenPlanId = "month";
let chosenGenre = null;    // null means "All"
let heroMovies = [];       // the movies that take turns in the hero
let heroIndex = 0;
let heroTimer = null;
let openMovie = null;      // the movie in the detail window
let currentOrder = null;   // the order in the payment window

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

// Show a message inside a pop-up window. Errors are red.
function showFormMessage(element, text, isError) {
  element.textContent = text;
  element.classList.toggle("error", isError === true);
}

// 15000 -> "15,000₮"
function money(amount) {
  return Number(amount).toLocaleString("en-US") + "₮";
}

// A date like "2026.11.12"
function dateText(date) {
  return date.getFullYear() + "." +
    String(date.getMonth() + 1).padStart(2, "0") + "." +
    String(date.getDate()).padStart(2, "0");
}

// A date with the time: "2026.11.12 18:30"
function dateTimeText(date) {
  return dateText(date) + " " +
    String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0");
}

// Turn a path stored in the database into a full web address.
function fileUrl(path) {
  const { data } = db.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Old small videos are in Supabase Storage and free for everyone.
// Big ones are in Cloudflare R2 and must be paid for.
function isPaidMovie(row) {
  return row.video_store === "r2";
}

// The average score of a movie, like "8.5". null if nobody rated it.
function ratingText(row) {
  if (!row.rating_count) {
    return null;
  }
  return (row.rating_sum / row.rating_count).toFixed(1);
}

function isSubscribed() {
  return account.subscribedUntil !== null && account.subscribedUntil > new Date();
}

function hasRental(row) {
  const end = account.rentals[row.id];
  return Boolean(end) && end > new Date();
}

// May the person on this computer watch this movie?
function canWatch(row) {
  return !isPaidMovie(row) || account.isAdmin || isSubscribed() || hasRental(row);
}

// ---------------------------------------------------------------
// LIGHT AND DARK COLORS
// The choice is kept in localStorage, a small notebook the browser
// keeps for each website, so it is still there on the next visit.
// ---------------------------------------------------------------
function switchTheme() {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("theme", next);
  } catch (error) {
    // Some browsers block the notebook in private mode. Not a problem.
  }
}

// ---------------------------------------------------------------
// THE TOP BAR
// ---------------------------------------------------------------
function showHeader() {
  const loggedIn = currentUser !== null;

  openLoginButton.hidden = loggedIn;
  myAvatar.hidden = !loggedIn;
  logoutButton.hidden = !loggedIn;
  openAdminButton.hidden = !account.isAdmin;
  openUploadButton.hidden = !account.isAdmin;

  if (loggedIn) {
    myAvatar.textContent = currentUser.email.charAt(0);
    myAvatar.title = currentUser.email;
  }
}

// Supabase calls this when the page opens and whenever somebody
// logs in or out.
db.auth.onAuthStateChange(function (event, session) {
  const before = currentUser ? currentUser.id : null;
  currentUser = session ? session.user : null;
  const after = currentUser ? currentUser.id : null;

  if (currentUser && loginDialog.open) {
    loginDialog.close();
  }

  // Supabase also calls this when it only refreshed the login. Then
  // nothing changed for us, and there is nothing to reload.
  if (event !== "INITIAL_SESSION" && before === after) {
    return;
  }

  // setTimeout lets Supabase finish its login work before we ask
  // the database anything.
  setTimeout(loadAccount, 0);
});

// ---------------------------------------------------------------
// MY ACCOUNT: am I an admin, what have I paid for, what do I like?
// Five questions to the database, asked at the same time.
// The database rules only ever show a person their OWN rows.
// ---------------------------------------------------------------
async function loadAccount() {
  if (!currentUser) {
    account = emptyAccount();
    showEverything();
    return;
  }

  const [admin, subscription, rentals, likes, ratings] = await Promise.all([
    db.rpc("is_admin"),
    db.from("subscriptions").select("paid_until").maybeSingle(),
    db.from("rentals").select("movie_id, expires_at"),
    db.from("likes").select("movie_id"),
    db.from("ratings").select("movie_id, score"),
  ]);

  for (const answer of [admin, subscription, rentals, likes, ratings]) {
    if (answer.error) {
      console.error("Could not load account:", answer.error);
    }
  }

  const fresh = emptyAccount();
  fresh.isAdmin = admin.data === true;
  if (subscription.data) {
    fresh.subscribedUntil = new Date(subscription.data.paid_until);
  }
  for (const row of rentals.data || []) {
    fresh.rentals[row.movie_id] = new Date(row.expires_at);
  }
  for (const row of likes.data || []) {
    fresh.likes[row.movie_id] = true;
  }
  for (const row of ratings.data || []) {
    fresh.ratings[row.movie_id] = row.score;
  }
  account = fresh;

  showEverything();

  if (account.isAdmin) {
    loadAdminCount();
  }
}

// Draw every part of the page again from what we remember.
function showEverything() {
  showHeader();
  showPlans();
  showHero();
  showGenreChips();
  showRows();
  showMovies(false);
  if (openMovie && movieDialog.open) {
    showMovieDialog();
  }
}

// ---------------------------------------------------------------
// MEMBERSHIP PLANS
// ---------------------------------------------------------------
async function loadPlans() {
  const { data, error } = await db
    .from("plans")
    .select("id, name, days, price, old_price")
    .order("sort_order");

  if (error) {
    console.error("Could not load plans:", error);
    return;
  }

  plans = data;
  showPlans();
}

function chosenPlan() {
  return plans.find(function (plan) {
    return plan.id === chosenPlanId;
  }) || plans[0];
}

function showPlans() {
  const plan = chosenPlan();

  planTabs.innerHTML = "";
  for (const row of plans) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "plan-tab";
    tab.textContent = row.name;
    // aria-pressed tells screen readers (and our CSS) which one is on.
    tab.setAttribute("aria-pressed", String(plan && row.id === plan.id));
    tab.addEventListener("click", function () {
      chosenPlanId = row.id;
      showPlans();
    });
    planTabs.appendChild(tab);
  }

  if (!plan) {
    planPrice.textContent = "";
    planBuyButton.disabled = true;
    return;
  }

  planBuyButton.disabled = false;
  planPrice.textContent = money(plan.price);

  // A crossed-out old price and "-22%" if there is a discount.
  const hasDiscount = Boolean(plan.old_price) && plan.old_price > plan.price;
  planOldPrice.hidden = !hasDiscount;
  planBadge.hidden = !hasDiscount;
  if (hasDiscount) {
    planOldPrice.textContent = money(plan.old_price);
    planBadge.textContent = "-" + Math.round((1 - plan.price / plan.old_price) * 100) + "% хямдрал";
  }

  planPerDay.textContent = plan.days > 1
    ? plan.days + " хоногийн эрх · өдөрт ≈ " + money(Math.round(plan.price / plan.days))
    : "24 цагийн эрх";

  planStatus.hidden = !isSubscribed();
  if (isSubscribed()) {
    planStatus.textContent = "Таны эрх " + dateText(account.subscribedUntil) + " хүртэл хүчинтэй";
    planBuyButton.textContent = "Сунгах";
  } else {
    planBuyButton.textContent = "Худалдан авах";
  }
}

// ---------------------------------------------------------------
// THE HERO: the top movies take turns
// ---------------------------------------------------------------
function pickHeroMovies() {
  // The most watched first. Movies with the same views: newest first
  // (allMovies is already newest first, and sort() keeps that order).
  heroMovies = allMovies
    .slice()
    .sort(function (a, b) {
      return b.view_count - a.view_count;
    })
    .slice(0, HERO_COUNT);

  if (heroIndex >= heroMovies.length) {
    heroIndex = 0;
  }
}

function showHero() {
  const row = heroMovies[heroIndex];
  const many = heroMovies.length > 1;

  heroPrevious.hidden = !many;
  heroNext.hidden = !many;
  heroButton.hidden = false;
  heroMoreButton.hidden = !row;

  heroDots.innerHTML = "";
  if (many) {
    heroMovies.forEach(function (movie, index) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero-dot";
      dot.setAttribute("aria-label", movie.title);
      dot.setAttribute("aria-current", String(index === heroIndex));
      dot.addEventListener("click", function () {
        goToHero(index);
      });
      heroDots.appendChild(dot);
    });
  }

  if (!row) {
    heroLabel.textContent = "";
    heroTitle.textContent = "Таны кино нэг дор";
    heroDescription.textContent = "Одоогоор кино алга. Удахгүй нэмэгдэнэ.";
    heroMeta.textContent = "";
    heroButton.hidden = !account.isAdmin;
    heroButton.textContent = "Кино нэмэх";
    heroBackdrop.hidden = true;
    heroPoster.hidden = true;
    return;
  }

  heroLabel.textContent = [row.genre, row.year].filter(Boolean).join(" · ") || "Онцлох кино";
  heroTitle.textContent = row.title;
  heroDescription.textContent = row.description || "";

  const facts = [];
  if (row.duration_minutes) {
    facts.push(row.duration_minutes + " мин");
  }
  if (ratingText(row)) {
    facts.push("★ " + ratingText(row));
  }
  facts.push(isPaidMovie(row) ? RENT_HOURS + " цаг үзэх эрх" : "Үнэгүй");
  heroMeta.textContent = facts.join("  ·  ");

  if (canWatch(row)) {
    heroButton.innerHTML = PLAY_ICON + "Үзэх";
  } else {
    heroButton.textContent = "Түрээслэх · " + money(row.rent_price);
  }

  heroBackdrop.hidden = !row.poster_path;
  heroPoster.hidden = !row.poster_path;
  if (row.poster_path) {
    const address = fileUrl(row.poster_path);
    // Only change the picture when it is a different one.
    if (heroPoster.getAttribute("src") !== address) {
      heroPoster.src = address;
      heroBackdrop.src = address;
    }
  }
}

function goToHero(index) {
  // "%" wraps around: after the last movie comes the first one.
  heroIndex = (index + heroMovies.length) % heroMovies.length;
  showHero();

  // Play the little "rise" movement again.
  for (const element of [heroContent, heroPoster]) {
    element.style.animation = "none";
    element.offsetWidth; // makes the browser notice the change
    element.style.animation = "";
  }

  startHeroTimer();
}

// Move to the next movie every few seconds. Not while a window is
// open, the mouse is on the hero, or the tab is in the background,
// and not for people who turned movement off in their settings.
function startHeroTimer() {
  clearInterval(heroTimer);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  heroTimer = setInterval(function () {
    const busy = document.querySelector("dialog[open]") || document.hidden || hero.matches(":hover");
    if (!busy && heroMovies.length > 1) {
      goToHero(heroIndex + 1);
    }
  }, HERO_SECONDS * 1000);
}

// ---------------------------------------------------------------
// READ THE MOVIES (SELECT)
// ---------------------------------------------------------------
const MOVIE_COLUMNS =
  "id, user_id, title, year, genre, description, video_path, video_store, poster_path, " +
  "duration_minutes, rent_price, view_count, like_count, rating_count, rating_sum";

async function loadMovies() {
  const { data, error } = await db
    .from("movies")
    .select(MOVIE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error("Could not load movies:", error);
    showToast("Алдаа: кинонуудыг ачаалж чадсангүй. " + error.message);
    return;
  }

  allMovies = data;
  pickHeroMovies();
  showHero();
  showGenreChips();
  showRows();
  showMovies(true);
  startHeroTimer();
}

// Ask the database for ONE movie again (after a like, a rating or
// a view) and put the fresh row in our list.
async function refreshMovie(id) {
  const { data, error } = await db
    .from("movies")
    .select(MOVIE_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return;
  }

  allMovies = allMovies.map(function (row) {
    return row.id === id ? data : row;
  });
  heroMovies = heroMovies.map(function (row) {
    return row.id === id ? data : row;
  });
  if (openMovie && openMovie.id === id) {
    openMovie = data;
  }

  showEverything();
}

// ---------------------------------------------------------------
// GENRE BUTTONS
// ---------------------------------------------------------------
function showGenreChips() {
  genreChips.innerHTML = "";

  for (const genre of [null].concat(GENRES)) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.textContent = genre || "Бүгд";
    chip.setAttribute("aria-pressed", String(genre === chosenGenre));
    chip.addEventListener("click", function () {
      chosenGenre = genre;
      showGenreChips();
      showRows();
      showMovies(false);
    });
    genreChips.appendChild(chip);
  }
}

// ---------------------------------------------------------------
// ONE MOVIE CARD
// Builds:
// <li class="movie-card">
//   <button class="movie-poster"> picture + price tag + play icon </button>
//   <p class="movie-title">the title</p>
//   <p class="movie-info">85 мин · ★ 8.5 · 24 үзсэн</p>
// </li>
// ---------------------------------------------------------------
function fillPoster(box, row) {
  box.innerHTML = "";

  if (row.poster_path) {
    const image = document.createElement("img");
    image.src = fileUrl(row.poster_path);
    image.alt = "";
    image.loading = "lazy"; // only download when scrolled into view
    box.appendChild(image);
  } else if (isPaidMovie(row)) {
    // No poster, and the video must be paid for: show the first
    // letter of the title.
    const letter = document.createElement("span");
    letter.className = "movie-letter";
    letter.textContent = row.title.charAt(0).toUpperCase();
    box.appendChild(letter);
  } else {
    // A free video with no poster: show one still picture from it.
    // "#t=2" means: the picture at second 2.
    // preload = "metadata" downloads only a tiny part of the file.
    const frame = document.createElement("video");
    frame.src = fileUrl(row.video_path) + "#t=2";
    frame.preload = "metadata";
    frame.muted = true;
    frame.playsInline = true;
    frame.tabIndex = -1;
    box.appendChild(frame);
  }
}

function makeCard(row, index, animate) {
  const poster = document.createElement("button");
  poster.type = "button";
  poster.className = "movie-poster";
  poster.setAttribute("aria-label", row.title);
  fillPoster(poster, row);

  const tag = document.createElement("span");
  tag.className = "movie-tag";
  if (!isPaidMovie(row)) {
    tag.textContent = "Үнэгүй";
    tag.classList.add("open");
  } else if (canWatch(row)) {
    tag.textContent = "Нээлттэй";
    tag.classList.add("open");
  } else {
    tag.textContent = money(row.rent_price);
  }
  poster.appendChild(tag);

  const play = document.createElement("span");
  play.className = "movie-play";
  play.innerHTML = PLAY_ICON;
  poster.appendChild(play);

  poster.addEventListener("click", function () {
    openMovieDialog(row);
  });

  const title = document.createElement("p");
  title.className = "movie-title";
  title.textContent = row.title;

  const info = document.createElement("p");
  info.className = "movie-info";
  const parts = [];
  if (row.duration_minutes) {
    parts.push(document.createTextNode(row.duration_minutes + " мин"));
  }
  if (ratingText(row)) {
    const star = document.createElement("span");
    star.className = "star";
    star.textContent = "★ " + ratingText(row);
    parts.push(star);
  }
  if (row.view_count > 0) {
    parts.push(document.createTextNode(row.view_count + " үзсэн"));
  }
  parts.forEach(function (part, position) {
    if (position > 0) {
      info.appendChild(document.createTextNode(" · "));
    }
    info.appendChild(part);
  });

  const item = document.createElement("li");
  item.className = "movie-card";
  if (animate) {
    // Each card appears a little later than the one before it.
    item.style.animationDelay = Math.min(index, 12) * 40 + "ms";
  } else {
    item.style.animation = "none";
  }
  item.appendChild(poster);
  item.appendChild(title);
  item.appendChild(info);
  return item;
}

// ---------------------------------------------------------------
// THE ROWS: top rated, new, most watched
// Shown only on the front view: no search text and no genre chosen.
// ---------------------------------------------------------------
function isFiltering() {
  return chosenGenre !== null || searchInput.value.trim() !== "";
}

function addRow(heading, rows) {
  if (rows.length === 0) {
    return;
  }

  const section = document.createElement("section");
  section.className = "shelf";

  const top = document.createElement("div");
  top.className = "shelf-heading";
  const title = document.createElement("h2");
  title.textContent = heading;
  top.appendChild(title);

  const list = document.createElement("ul");
  list.className = "movie-row";
  rows.forEach(function (row, index) {
    list.appendChild(makeCard(row, index, false));
  });

  section.appendChild(top);
  section.appendChild(list);
  rowsBox.appendChild(section);
}

function showRows() {
  rowsBox.innerHTML = "";

  // With only a few movies, three rows would just repeat the grid.
  if (isFiltering() || allMovies.length < 6) {
    return;
  }

  const rated = allMovies
    .filter(function (row) {
      return row.rating_count > 0;
    })
    .sort(function (a, b) {
      return b.rating_sum / b.rating_count - a.rating_sum / a.rating_count;
    })
    .slice(0, 5);

  const watched = allMovies
    .filter(function (row) {
      return row.view_count > 0;
    })
    .sort(function (a, b) {
      return b.view_count - a.view_count;
    })
    .slice(0, 12);

  addRow("Хамгийн өндөр үнэлгээтэй", rated);
  addRow("Шинээр нэмэгдсэн", allMovies.slice(0, 12));
  addRow("Хамгийн их үзсэн", watched);
}

// ---------------------------------------------------------------
// THE GRID: every movie, or the ones that match the search box and
// the chosen genre. This is called FILTERING. It happens here in
// the browser, which is fine for a few hundred movies.
// "animate" says if the cards should slide in.
// ---------------------------------------------------------------
function showMovies(animate) {
  const search = searchInput.value.trim().toLowerCase();

  const data = allMovies.filter(function (row) {
    const genreMatches = chosenGenre === null || row.genre === chosenGenre;
    const searchMatches = search === "" || row.title.toLowerCase().includes(search);
    return genreMatches && searchMatches;
  });

  gridHeading.textContent = search !== "" ? "Хайлтын үр дүн" : chosenGenre || "Бүх кино";
  movieCount.textContent = data.length + " кино";
  movieList.innerHTML = "";

  if (data.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = allMovies.length === 0
      ? "Одоогоор кино алга."
      : "Тохирох кино олдсонгүй. Өөр үг эсвэл төрөл сонгоно уу.";
    movieList.appendChild(item);
    return;
  }

  data.forEach(function (row, index) {
    movieList.appendChild(makeCard(row, index, animate));
  });
}

// ---------------------------------------------------------------
// THE WINDOW FOR ONE MOVIE
// ---------------------------------------------------------------
function openMovieDialog(row) {
  openMovie = row;
  showMovieDialog();
  if (!movieDialog.open) {
    movieDialog.showModal();
  }
}

function showMovieDialog() {
  const row = openMovie;

  fillPoster(moviePoster, row);
  movieGenre.textContent = [row.genre, row.year].filter(Boolean).join(" · ");
  movieTitle.textContent = row.title;
  movieDescription.textContent = row.description || "";

  movieMeta.innerHTML = "";
  const facts = [];
  if (row.duration_minutes) {
    facts.push(row.duration_minutes + " мин");
  }
  if (ratingText(row)) {
    facts.push("★ " + ratingText(row) + " / 10 (" + row.rating_count + ")");
  }
  facts.push(row.view_count + " үзсэн");
  facts.forEach(function (fact, index) {
    if (index > 0) {
      movieMeta.appendChild(document.createTextNode("  ·  "));
    }
    const part = document.createElement("span");
    part.textContent = fact;
    if (fact.startsWith("★")) {
      part.className = "star";
    }
    movieMeta.appendChild(part);
  });

  // Which buttons, and what do they say?
  const allowed = canWatch(row);
  movieWatchButton.hidden = !allowed;
  movieWatchButton.innerHTML = PLAY_ICON + "Үзэх";
  movieRentButton.hidden = allowed;
  movieRentButton.textContent = "Түрээслэх · " + money(row.rent_price) + " (" + RENT_HOURS + " цаг)";
  moviePlanButton.hidden = allowed;

  // Why may I watch? Tell the person.
  let reason = "";
  if (!isPaidMovie(row)) {
    reason = "Энэ кино үнэгүй.";
  } else if (isSubscribed()) {
    reason = "Гишүүнчлэлийн эрх " + dateText(account.subscribedUntil) + " хүртэл хүчинтэй.";
  } else if (hasRental(row)) {
    reason = "Түрээсийн эрх " + dateTimeText(account.rentals[row.id]) + " хүртэл хүчинтэй.";
  }
  movieAccess.hidden = reason === "";
  movieAccess.textContent = reason;

  movieLikeButton.setAttribute("aria-pressed", String(account.likes[row.id] === true));
  movieLikeCount.textContent = row.like_count;

  // Five stars. My score is from 1 to 10, so 2 points light one star.
  const myStars = Math.round((account.ratings[row.id] || 0) / 2);
  movieStars.innerHTML = "";
  for (let star = 1; star <= 5; star++) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "star-button" + (star <= myStars ? " on" : "");
    button.textContent = "★";
    button.setAttribute("aria-label", star + " од");
    button.addEventListener("click", function () {
      rateMovie(row, star * 2);
    });
    movieStars.appendChild(button);
  }

  movieDeleteButton.hidden = !account.isAdmin;
}

// Liking, rating, watching a paid movie and buying all need a login.
// Returns true if logged in; otherwise opens the login window and
// returns false.
function needLogin(reason) {
  if (currentUser) {
    return true;
  }
  showFormMessage(loginMessage, reason);
  if (movieDialog.open) {
    movieDialog.close();
  }
  loginDialog.showModal();
  return false;
}

async function likeMovie() {
  const row = openMovie;
  if (!needLogin("Таалагдсан гэж тэмдэглэхийн тулд нэвтэрнэ үү.")) {
    return;
  }

  movieLikeButton.disabled = true;
  // The database function adds or removes my like, and answers
  // true if the movie is liked afterwards.
  const { data, error } = await db.rpc("toggle_like", { target_movie: row.id });
  movieLikeButton.disabled = false;

  if (error) {
    console.error("Could not like:", error);
    showToast("Алдаа: " + error.message);
    return;
  }

  if (data) {
    account.likes[row.id] = true;
  } else {
    delete account.likes[row.id];
  }
  await refreshMovie(row.id);
}

async function rateMovie(row, score) {
  if (!needLogin("Үнэлгээ өгөхийн тулд нэвтэрнэ үү.")) {
    return;
  }

  const { error } = await db.rpc("rate_movie", { target_movie: row.id, new_score: score });

  if (error) {
    console.error("Could not rate:", error);
    showToast("Алдаа: " + error.message);
    return;
  }

  account.ratings[row.id] = score;
  showToast("Үнэлгээ өгсөнд баярлалаа.");
  await refreshMovie(row.id);
}

// ---------------------------------------------------------------
// WATCH A MOVIE
// The browser does not download the whole video first. It asks for
// small pieces as you watch. This is called STREAMING.
// ---------------------------------------------------------------
async function playMovie(row) {
  let address = null;

  if (isPaidMovie(row)) {
    if (!needLogin("Кино үзэхийн тулд нэвтэрнэ үү.")) {
      return;
    }

    // Ask the server for a watching link. The server asks the
    // database if this person has paid. The link works for a few hours.
    try {
      const answer = await callApi("POST", "play", { key: row.video_path });
      address = answer.url;
    } catch (error) {
      // 402 means "payment required". Our list said yes but the
      // server says no: the time probably just ran out.
      if (error.status === 402) {
        showToast("Таны үзэх эрх дууссан байна.");
        await loadAccount();
      } else {
        console.error("Could not open movie:", error);
        showToast("Алдаа: " + error.message);
      }
      return;
    }
  } else {
    address = fileUrl(row.video_path);
  }

  if (movieDialog.open) {
    movieDialog.close();
  }

  playerTitle.textContent = row.title;
  playerMeta.textContent = [row.genre, row.year, row.duration_minutes ? row.duration_minutes + " мин" : null]
    .filter(Boolean)
    .join(" · ");
  playerVideo.src = address;
  playerDialog.showModal();
  // play() can be refused by the browser. Then the visitor just
  // presses the play button themselves.
  playerVideo.play().catch(function () {});

  // Add one to the movie's view counter. We do not wait for it.
  db.rpc("count_view", { target_movie: row.id }).then(function () {
    refreshMovie(row.id);
  });
}

// Runs whenever the player window closes: by the X button, by the
// Esc key, or by a click on the dark background.
function stopPlayer() {
  playerVideo.pause();
  playerVideo.removeAttribute("src");
  playerVideo.load(); // forget the old video, stop downloading it
}

// ---------------------------------------------------------------
// BUY: make an order and show how to pay
// ---------------------------------------------------------------

// kind is "plan" or "rental". The database works out the price and
// makes the 6-digit code. See create_order in supabase-setup.sql.
async function startOrder(kind, planId, movieId, itemName) {
  if (!needLogin("Худалдан авахын тулд нэвтэрнэ үү.")) {
    return;
  }

  const { data, error } = await db.rpc("create_order", {
    order_kind: kind,
    order_plan: planId,
    order_movie: movieId,
  });

  if (error) {
    console.error("Could not make order:", error);
    showToast("Алдаа: " + error.message);
    return;
  }

  currentOrder = data;

  if (movieDialog.open) {
    movieDialog.close();
  }

  orderItem.textContent = itemName;
  orderAmount.textContent = money(data.amount);
  orderCode.textContent = data.code;
  showFormMessage(orderMessage, "");
  orderDialog.showModal();

  if (account.isAdmin) {
    loadAdminCount();
  }
}

function buyPlan() {
  const plan = chosenPlan();
  if (plan) {
    startOrder("plan", plan.id, null, "Гишүүнчлэл · " + plan.name);
  }
}

function rentMovie() {
  const row = openMovie;
  startOrder("rental", null, row.id, row.title + " · " + RENT_HOURS + " цагийн түрээс");
}

// The "I have paid" button: look at the order again.
async function checkOrder() {
  orderCheckButton.disabled = true;
  showFormMessage(orderMessage, "Шалгаж байна...");

  const { data, error } = await db
    .from("orders")
    .select("status")
    .eq("id", currentOrder.id)
    .maybeSingle();

  orderCheckButton.disabled = false;

  if (error || !data) {
    showFormMessage(orderMessage, "Шалгаж чадсангүй. Дахин оролдоно уу.", true);
    return;
  }

  if (data.status === "paid") {
    orderDialog.close();
    showToast("Төлбөр баталгаажлаа. Сайхан үзээрэй!");
    await loadAccount();
  } else if (data.status === "cancelled") {
    showFormMessage(orderMessage, "Энэ захиалга цуцлагдсан байна.", true);
  } else {
    showFormMessage(orderMessage, "Төлбөр хараахан баталгаажаагүй байна. Төлснөөс хойш 1 өдөр хүртэл хүлээнэ үү.");
  }
}

async function cancelOrder() {
  orderCancelButton.disabled = true;
  const { error } = await db.rpc("cancel_order", { order_id: currentOrder.id });
  orderCancelButton.disabled = false;

  if (error) {
    console.error("Could not cancel order:", error);
    showFormMessage(orderMessage, "Цуцалж чадсангүй. " + error.message, true);
    return;
  }

  orderDialog.close();
  showToast("Захиалга цуцлагдлаа.");
}

async function copyOrderCode() {
  try {
    await navigator.clipboard.writeText(orderCode.textContent);
    showFormMessage(orderMessage, "Код хуулагдлаа.");
  } catch (error) {
    showFormMessage(orderMessage, "Хуулж чадсангүй. Кодыг гараар бичнэ үү.", true);
  }
}

// ---------------------------------------------------------------
// ADMIN: see the orders and confirm the payments
// The functions admin_orders, confirm_order and cancel_order live
// in the database and refuse anyone who is not an admin. Hiding the
// button from customers is only for a tidy screen.
// ---------------------------------------------------------------
async function loadAdminCount() {
  const { count, error } = await db
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (error) {
    return;
  }
  adminCount.hidden = count === 0;
  adminCount.textContent = count;
}

function makeOrderRow(order) {
  const item = document.createElement("li");
  item.className = "order-row";

  const code = document.createElement("span");
  code.className = "order-row-code";
  code.textContent = order.code;

  const text = document.createElement("span");
  text.className = "order-row-text";
  text.textContent = (order.kind === "plan" ? "Гишүүнчлэл · " : "Түрээс · ") + order.item;
  const small = document.createElement("small");
  small.textContent = order.email + " · " + dateTimeText(new Date(order.created_at));
  text.appendChild(small);

  const amount = document.createElement("span");
  amount.className = "order-row-amount";
  amount.textContent = money(order.amount);

  item.appendChild(code);
  item.appendChild(text);
  item.appendChild(amount);

  if (order.status === "pending") {
    const confirmButton = document.createElement("button");
    confirmButton.type = "button";
    confirmButton.className = "button button-accent";
    confirmButton.textContent = "Баталгаажуулах";
    confirmButton.addEventListener("click", function () {
      const question = order.code + " кодтой " + money(order.amount) + " төлбөр таны дансанд орсон уу?";
      if (confirm(question)) {
        changeOrder("confirm_order", order, confirmButton);
      }
    });

    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "button button-ghost";
    cancelButton.textContent = "Цуцлах";
    cancelButton.addEventListener("click", function () {
      changeOrder("cancel_order", order, cancelButton);
    });

    item.appendChild(confirmButton);
    item.appendChild(cancelButton);
  } else {
    const status = document.createElement("span");
    status.className = "order-row-status" + (order.status === "paid" ? " paid" : "");
    status.textContent = order.status === "paid" ? "Төлөгдсөн" : "Цуцлагдсан";
    item.appendChild(status);
  }

  return item;
}

async function showAdminOrders() {
  showFormMessage(adminMessage, "Ачаалж байна...");

  const { data, error } = await db.rpc("admin_orders");

  if (error) {
    console.error("Could not load orders:", error);
    showFormMessage(adminMessage, "Захиалгуудыг ачаалж чадсангүй. " + error.message, true);
    return;
  }

  showFormMessage(adminMessage, "");
  adminPending.innerHTML = "";
  adminDone.innerHTML = "";

  for (const order of data) {
    (order.status === "pending" ? adminPending : adminDone).appendChild(makeOrderRow(order));
  }

  for (const list of [adminPending, adminDone]) {
    if (list.children.length === 0) {
      const empty = document.createElement("li");
      empty.className = "order-empty";
      empty.textContent = list === adminPending ? "Хүлээгдэж буй захиалга алга." : "Одоогоор алга.";
      list.appendChild(empty);
    }
  }

  loadAdminCount();
}

async function changeOrder(functionName, order, button) {
  button.disabled = true;
  const { error } = await db.rpc(functionName, { order_id: order.id });

  if (error) {
    console.error("Could not change order:", error);
    showFormMessage(adminMessage, "Алдаа: " + error.message, true);
    button.disabled = false;
    return;
  }

  await showAdminOrders();
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

  if (!file) {
    return;
  }

  // Helpful: use the file name as the title if the title is empty.
  if (titleInput.value.trim() === "") {
    titleInput.value = file.name.replace(/\.[^.]+$/, "").slice(0, 100);
  }

  // Helpful: read how long the video is, and fill in the minutes.
  // The browser only reads the start of the file for this.
  const probe = document.createElement("video");
  probe.preload = "metadata";
  probe.addEventListener("loadedmetadata", function () {
    if (Number.isFinite(probe.duration) && durationInput.value === "") {
      durationInput.value = Math.max(1, Math.round(probe.duration / 60));
    }
    URL.revokeObjectURL(probe.src);
  });
  probe.src = URL.createObjectURL(file);
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
// TALK TO OUR OWN SERVER CODE (the functions folder)
// ---------------------------------------------------------------

// The access token proves to the server who is logged in.
// Supabase swaps it for a fresh one about once an hour, so we ask
// for it again before every request. A big upload can take longer
// than an hour.
async function accessToken() {
  const { data } = await db.auth.getSession();
  if (!data.session) {
    throw new Error("Та гарсан байна. Дахин нэвтэрнэ үү.");
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

// Send one small file (the poster) to Supabase Storage.
async function uploadPoster(file, extension) {
  // The path is: my user id / a random name . the file type
  const path = currentUser.id + "/" + crypto.randomUUID() + "." + extension;

  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });

  return { path: path, error: error };
}

// Send ONE piece of the video. onProgress gets the bytes sent so far.
// XMLHttpRequest is an older browser tool, but it can tell us how
// far an upload is, and fetch() cannot.
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
      reject(new Error("Сүлжээний алдаа. Интернэтээ шалгана уу."));
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
      return { path: null, error: new Error("Зөвхөн жинхэнэ сайт (pages.dev) дээр кино оруулах боломжтой.") };
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

// ---------------------------------------------------------------
// UPLOAD A MOVIE (admins)
// The video goes to Cloudflare R2, the poster goes to Supabase
// Storage, then one row goes to the database.
// ---------------------------------------------------------------
async function addMovie(event) {
  event.preventDefault();

  const title = titleInput.value.trim();
  const description = descriptionInput.value.trim();
  const year = yearInput.value === "" ? null : Number(yearInput.value);
  const duration = durationInput.value === "" ? null : Number(durationInput.value);
  const price = Number(priceInput.value);
  const videoFile = videoInput.files[0];
  const posterFile = posterInput.files[0];

  if (title === "") {
    showFormMessage(uploadMessage, "Киноны нэрийг бичнэ үү.", true);
    return;
  }
  if (!videoFile) {
    showFormMessage(uploadMessage, "Видео файл сонгоно уу.", true);
    return;
  }
  if (!VIDEO_TYPES[videoFile.type]) {
    showFormMessage(uploadMessage, "Видео нь MP4 эсвэл WebM байх ёстой.", true);
    return;
  }
  if (videoFile.size > MAX_VIDEO_BYTES) {
    showFormMessage(uploadMessage, "Видео 5 GB-аас бага байх ёстой. Энэ нь " + fileSize(videoFile.size) + ".", true);
    return;
  }
  if (!Number.isInteger(price) || price < 0) {
    showFormMessage(uploadMessage, "Түрээсийн үнийг зөв бичнэ үү.", true);
    return;
  }
  if (posterFile) {
    if (!POSTER_TYPES[posterFile.type]) {
      showFormMessage(uploadMessage, "Постер нь JPG, PNG эсвэл WebP байх ёстой.", true);
      return;
    }
    if (posterFile.size > MAX_POSTER_BYTES) {
      showFormMessage(uploadMessage, "Постер 2 MB-аас бага байх ёстой.", true);
      return;
    }
  }

  uploading = true;
  uploadButton.disabled = true;
  uploadProgress.hidden = false;
  setUploadProgress(0);
  showFormMessage(uploadMessage, "Эхэлж байна...");

  // STEP 1: upload the video to Cloudflare R2, piece by piece.
  const video = await uploadBigVideo(videoFile, function (sentBytes) {
    const fraction = sentBytes / videoFile.size;
    setUploadProgress(fraction);
    showFormMessage(
      uploadMessage,
      "Видео оруулж байна... " + Math.floor(fraction * 100) + "% (" +
        fileSize(sentBytes) + " / " + fileSize(videoFile.size) + "). Энэ хуудсыг бүү хаагаарай."
    );
  });

  if (video.error) {
    console.error("Could not upload video:", video.error);
    showFormMessage(uploadMessage, "Видео оруулж чадсангүй. " + video.error.message, true);
    finishUpload();
    return;
  }

  // STEP 2: upload the poster to Supabase Storage (if there is one).
  let posterPath = null;

  if (posterFile) {
    showFormMessage(uploadMessage, "Постер оруулж байна...");

    const poster = await uploadPoster(posterFile, POSTER_TYPES[posterFile.type]);

    if (poster.error) {
      console.error("Could not upload poster:", poster.error);
      showFormMessage(uploadMessage, "Постер оруулж чадсангүй. " + poster.error.message, true);
      await deleteBigVideo(video.path);
      finishUpload();
      return;
    }
    posterPath = poster.path;
  }

  // STEP 3: save the movie row, with the paths of the files.
  showFormMessage(uploadMessage, "Хадгалж байна...");

  const { error } = await db.from("movies").insert({
    title: title,
    year: year,
    genre: genreInput.value === "" ? null : genreInput.value,
    description: description === "" ? null : description,
    duration_minutes: duration,
    rent_price: price,
    video_path: video.path,
    video_store: "r2",
    poster_path: posterPath,
  });

  if (error) {
    console.error("Could not save movie:", error);
    showFormMessage(uploadMessage, "Кино хадгалж чадсангүй. " + error.message, true);
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
  showToast("Кино нэмэгдлээ.");
  await loadMovies();
}

// ---------------------------------------------------------------
// DELETE A MOVIE (admins)
// ---------------------------------------------------------------
async function deleteMovie() {
  const row = openMovie;

  if (!confirm('"' + row.title + '" киног устгах уу?')) {
    return;
  }

  movieDeleteButton.disabled = true;
  const { error } = await db.from("movies").delete().eq("id", row.id);
  movieDeleteButton.disabled = false;

  if (error) {
    console.error("Could not delete movie:", error);
    showToast("Алдаа: кино устгаж чадсангүй. " + error.message);
    return;
  }

  // The files are separate from the row, so we remove them ourselves.
  // The poster is always in Supabase Storage. The video is there
  // too if it is an old one; new videos are in Cloudflare R2.
  const paths = [];
  if (row.poster_path) {
    paths.push(row.poster_path);
  }
  if (isPaidMovie(row)) {
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

  movieDialog.close();
  showToast("Кино устгагдлаа.");
  await loadMovies();
}

// ---------------------------------------------------------------
// SIGN UP, LOG IN, LOG OUT
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
  showFormMessage(loginMessage, "Бүртгэл үүсгэж байна...");

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
    data.session ? "" : "Бүртгэл үүслээ. Имэйлээ шалгаж баталгаажуулаад нэвтэрнэ үү."
  );
}

async function logIn(event) {
  event.preventDefault();

  setLoginButtonsDisabled(true);
  showFormMessage(loginMessage, "Нэвтэрч байна...");

  const { error } = await db.auth.signInWithPassword({
    email: emailInput.value.trim(),
    password: passwordInput.value,
  });

  setLoginButtonsDisabled(false);

  if (error) {
    console.error("Log in failed:", error);
    showFormMessage(loginMessage, "Нэвтэрч чадсангүй. Имэйл, нууц үгээ шалгана уу. (" + error.message + ")", true);
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
    showToast("Алдаа: " + error.message);
    return;
  }

  showToast("Та гарлаа.");
}

// ---------------------------------------------------------------
// CONNECT THE BUTTONS
// ---------------------------------------------------------------
themeButton.addEventListener("click", switchTheme);
loginForm.addEventListener("submit", logIn);
signupButton.addEventListener("click", signUp);
logoutButton.addEventListener("click", logOut);
movieForm.addEventListener("submit", addMovie);
videoInput.addEventListener("change", showChosenVideo);
posterInput.addEventListener("change", showChosenPoster);

openLoginButton.addEventListener("click", function () {
  showFormMessage(loginMessage, "");
  loginDialog.showModal();
});
openUploadButton.addEventListener("click", function () {
  uploadDialog.showModal();
});
openAdminButton.addEventListener("click", function () {
  adminDialog.showModal();
  showAdminOrders();
});

planBuyButton.addEventListener("click", buyPlan);

heroPrevious.addEventListener("click", function () {
  goToHero(heroIndex - 1);
});
heroNext.addEventListener("click", function () {
  goToHero(heroIndex + 1);
});
// The big hero button: watch the movie if allowed, otherwise open
// its window, where the rent and membership buttons are.
heroButton.addEventListener("click", function () {
  const row = heroMovies[heroIndex];
  if (!row) {
    uploadDialog.showModal();
  } else if (canWatch(row)) {
    playMovie(row);
  } else {
    openMovieDialog(row);
  }
});
heroMoreButton.addEventListener("click", function () {
  openMovieDialog(heroMovies[heroIndex]);
});

movieWatchButton.addEventListener("click", function () {
  playMovie(openMovie);
});
movieRentButton.addEventListener("click", rentMovie);
moviePlanButton.addEventListener("click", buyPlan);
movieLikeButton.addEventListener("click", likeMovie);
movieDeleteButton.addEventListener("click", deleteMovie);

orderCheckButton.addEventListener("click", checkOrder);
orderCancelButton.addEventListener("click", cancelOrder);
orderCopyButton.addEventListener("click", copyOrderCode);

playerDialog.addEventListener("close", stopPlayer);

// For every pop-up window: the X button closes it, and so does a
// click on the dark background around it.
for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("click", function (event) {
    if (event.target === dialog || event.target.closest("[data-close]")) {
      dialog.close();
    }
  });
}

// "input" fires on every letter typed in the search box.
searchInput.addEventListener("input", function () {
  showRows();
  showMovies(false);
});

// Fill the genre list in the upload window from GENRES.
for (const genre of GENRES) {
  const option = document.createElement("option");
  option.value = genre;
  option.textContent = genre;
  genreInput.appendChild(option);
}

// Put the bank details into the payment window.
$("pay-bank").textContent = PAYMENT.bank;
$("pay-account").textContent = PAYMENT.account;
$("pay-name").textContent = PAYMENT.name;

// Start: plans and movies are public, so load them right away.
// The account loads when Supabase tells us who is logged in.
loadPlans();
loadMovies();
