/*
  Kanye West music player
  -----------------------
  Plays a 5-song stack from MP3 files that sit in the same folder as this script.
  To change a song, edit the TRACKS list below. The "file" must match the MP3's
  file name exactly (capital letters count once the site is on GitHub).
  Any button on a page with data-track="0" to "4" plays that song.
*/
(function () {
  "use strict";

  var ARTIST = "Kanye West";
  var THUMB = "kanye.jpg";
  var ENTER_ART = "graduation.jpg";
  var TRACKS = [
    { title: "Runaway", album: "My Beautiful Dark Twisted Fantasy", file: "runaway.mp3" },
    { title: "Ghost Town", album: "ye", file: "ghost-town.mp3" },
    { title: "Late", album: "Late Registration", file: "late.mp3" },
    { title: "I Wonder", album: "Graduation", file: "i-wonder.mp3" },
    { title: "We Major", album: "Late Registration", file: "we-major.mp3" }
  ];
  var SKIP_SECONDS = 10;
  var STORE_KEY = "ye-player";

  /* ---------- Saved state (keeps the song going when you change pages) ---------- */

  function loadState() {
    try {
      return JSON.parse(sessionStorage.getItem(STORE_KEY));
    } catch (e) {
      return null;
    }
  }

  function saveState() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify({
        i: index,
        t: pendingSeek || audio.currentTime || 0,
        playing: !audio.paused || wantsToPlay
      }));
    } catch (e) {
      /* storage not available - the player still works, it just won't resume */
    }
  }

  /* ---------- Icons ---------- */

  var ICONS = {
    prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h2.5v14H5zM20 5v14L8.5 12z"/></svg>',
    rew: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11.5 6v12L3 12zM21 6v12l-8.5-6z"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15L19.5 12z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    ff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12.5 6v12l8.5-6zM3 6v12l8.5-6z"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 5H19v14h-2.5zM4 5v14l11.5-7z"/></svg>'
  };

  /* ---------- Build the player ---------- */

  var root = document.createElement("div");
  root.innerHTML =
    '<div class="player" role="region" aria-label="Music player">' +
    '  <div class="player-now">' +
    '    <img class="player-cover" src="' + THUMB + '" alt="">' +
    '    <div class="player-info">' +
    '      <span class="player-label">Now listening to</span>' +
    '      <span class="player-title"></span>' +
    '      <span class="player-artist">' + ARTIST + '</span>' +
    '    </div>' +
    '    <button class="queue-toggle" type="button" aria-expanded="false" aria-controls="player-queue">Top 5</button>' +
    '  </div>' +
    '  <div class="player-main">' +
    '    <div class="player-controls">' +
    '      <button type="button" class="ctrl" data-action="prev" title="Previous song" aria-label="Previous song">' + ICONS.prev + '</button>' +
    '      <button type="button" class="ctrl" data-action="rew" title="Rewind ' + SKIP_SECONDS + ' seconds" aria-label="Rewind ' + SKIP_SECONDS + ' seconds">' + ICONS.rew + '</button>' +
    '      <button type="button" class="ctrl ctrl-play" data-action="toggle" title="Play" aria-label="Play">' + ICONS.play + '</button>' +
    '      <button type="button" class="ctrl" data-action="ff" title="Fast-forward ' + SKIP_SECONDS + ' seconds" aria-label="Fast-forward ' + SKIP_SECONDS + ' seconds">' + ICONS.ff + '</button>' +
    '      <button type="button" class="ctrl" data-action="next" title="Next song" aria-label="Next song">' + ICONS.next + '</button>' +
    '    </div>' +
    '    <div class="player-progress">' +
    '      <span class="time time-cur">0:00</span>' +
    '      <input class="seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Song position">' +
    '      <span class="time time-dur">0:00</span>' +
    '    </div>' +
    '  </div>' +
    '  <ol class="queue" id="player-queue" hidden></ol>' +
    '</div>' +
    '<div class="player-toast" aria-live="polite"></div>' +
    '<div class="enter-overlay" hidden>' +
    '  <div class="enter-box">' +
    '    <img src="' + ENTER_ART + '" alt="Graduation album artwork">' +
    '    <button type="button" class="enter-btn">' + ICONS.play + ' Click to Enter</button>' +
    '    <p><strong>' + TRACKS[0].title + '</strong> by ' + ARTIST + ' starts when you enter.</p>' +
    '  </div>' +
    '</div>';

  while (root.firstChild) {
    document.body.appendChild(root.firstChild);
  }
  document.body.classList.add("has-player");

  var player = document.querySelector(".player");
  var labelEl = player.querySelector(".player-label");
  var titleEl = player.querySelector(".player-title");
  var artistEl = player.querySelector(".player-artist");
  var playBtn = player.querySelector(".ctrl-play");
  var seek = player.querySelector(".seek");
  var curEl = player.querySelector(".time-cur");
  var durEl = player.querySelector(".time-dur");
  var queueBtn = player.querySelector(".queue-toggle");
  var queueEl = player.querySelector(".queue");
  var toast = document.querySelector(".player-toast");
  var pageButtons = Array.prototype.slice.call(document.querySelectorAll("[data-track]"));
  var overlay = document.querySelector(".enter-overlay");

  /* ---------- Audio ---------- */

  var audio = new Audio();
  audio.preload = "auto";
  audio.volume = 0.85;

  var index = 0;
  var pendingSeek = 0;
  var wantsToPlay = false;
  var blocked = false;
  var dragging = false;
  var unlockedAt = 0;
  var lastSave = 0;
  var toastTimer = null;
  var toastedIndex = -1;
  var saved = loadState();

  function fmt(sec) {
    if (!isFinite(sec) || sec < 0) return "0:00";
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function track() {
    return TRACKS[index];
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 3200);
  }

  function updateLabel() {
    if (player.classList.contains("has-error")) return;
    if (blocked) {
      labelEl.textContent = "Click anywhere to start";
    } else if (audio.paused) {
      labelEl.textContent = "Paused";
    } else {
      labelEl.textContent = "Now listening to";
    }
  }

  function renderQueue() {
    queueEl.innerHTML = "";
    TRACKS.forEach(function (t, i) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "queue-item" + (i === index ? " current" : "");
      btn.innerHTML =
        '<span class="q-num">' + (i + 1) + "</span>" +
        '<span class="q-title"></span>' +
        (i === index ? '<span class="q-now">Now playing</span>' : "");
      btn.querySelector(".q-title").textContent = t.title;
      btn.addEventListener("click", function () {
        loadTrack(i, 0);
        play();
      });
      li.appendChild(btn);
      queueEl.appendChild(li);
    });
    // Play buttons placed on the pages themselves (for example on songs.html)
    pageButtons.forEach(function (b) {
      var current = Number(b.getAttribute("data-track")) === index;
      b.classList.toggle("is-current", current);
    });
  }

  function setMediaSession() {
    if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track().title,
        artist: ARTIST,
        album: track().album,
        artwork: [{ src: ENTER_ART, sizes: "425x600", type: "image/jpeg" }]
      });
    } catch (e) {
      /* not supported - ignore */
    }
  }

  function loadTrack(i, startAt) {
    index = (i + TRACKS.length) % TRACKS.length;
    pendingSeek = startAt || 0;
    player.classList.remove("has-error");
    titleEl.textContent = track().title;
    artistEl.textContent = ARTIST + " \u00b7 " + track().album;
    audio.src = track().file;
    seek.value = 0;
    curEl.textContent = fmt(pendingSeek);
    durEl.textContent = "0:00";
    renderQueue();
    setMediaSession();
    updateLabel();
    saveState();
  }

  function onBlocked() {
    blocked = true;
    wantsToPlay = true;
    if (!saved) {
      overlay.hidden = false;
    }
    player.classList.add("needs-tap");
    updateLabel();
  }

  function play() {
    wantsToPlay = true;
    var p = audio.play();
    if (p && typeof p.then === "function") {
      p.then(function () {
        if (blocked) {
          blocked = false;
          player.classList.remove("needs-tap");
        }
        updateLabel();
      }).catch(function (err) {
        if (err && err.name === "NotAllowedError") {
          onBlocked();
        }
      });
    }
  }

  function pause() {
    wantsToPlay = false;
    audio.pause();
  }

  function unlock() {
    if (!blocked) return;
    blocked = false;
    unlockedAt = Date.now();
    overlay.hidden = true;
    player.classList.remove("needs-tap");
    play();
  }

  /* Browsers only allow sound after the visitor clicks or presses a key, so the
     first click or key press anywhere on the page starts the music if it was blocked. */
  document.addEventListener("pointerdown", unlock, true);
  document.addEventListener("keydown", unlock, true);

  /* ---------- Controls ---------- */

  function act(action) {
    switch (action) {
      case "toggle":
        if (Date.now() - unlockedAt < 500) return; // this click already started the music
        if (audio.paused) {
          play();
        } else {
          pause();
        }
        break;
      case "rew":
        audio.currentTime = Math.max(0, audio.currentTime - SKIP_SECONDS);
        break;
      case "ff":
        if (isFinite(audio.duration)) {
          audio.currentTime = Math.min(audio.duration - 0.25, audio.currentTime + SKIP_SECONDS);
        }
        break;
      case "prev":
        if (audio.currentTime > 3) {
          audio.currentTime = 0;
        } else {
          loadTrack(index - 1, 0);
          if (wantsToPlay) play();
        }
        break;
      case "next":
        loadTrack(index + 1, 0);
        if (wantsToPlay) play();
        break;
    }
  }

  player.querySelectorAll(".ctrl").forEach(function (btn) {
    btn.addEventListener("click", function () {
      act(btn.getAttribute("data-action"));
    });
  });

  pageButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      var i = Number(b.getAttribute("data-track"));
      if (!TRACKS[i]) return;
      if (i === index && !audio.paused) return;
      if (i !== index) loadTrack(i, 0);
      play();
    });
  });

  queueBtn.addEventListener("click", function () {
    var open = queueEl.hidden;
    queueEl.hidden = !open;
    queueBtn.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("click", function (e) {
    if (!queueEl.hidden && !player.contains(e.target)) {
      queueEl.hidden = true;
      queueBtn.setAttribute("aria-expanded", "false");
    }
  });

  seek.addEventListener("input", function () {
    dragging = true;
    if (isFinite(audio.duration)) {
      curEl.textContent = fmt((seek.value / 1000) * audio.duration);
    }
  });

  seek.addEventListener("change", function () {
    if (isFinite(audio.duration)) {
      audio.currentTime = (seek.value / 1000) * audio.duration;
    }
    dragging = false;
  });

  /* ---------- Audio events ---------- */

  audio.addEventListener("loadedmetadata", function () {
    if (pendingSeek && isFinite(audio.duration)) {
      audio.currentTime = Math.min(pendingSeek, Math.max(0, audio.duration - 1));
    }
    pendingSeek = 0;
    durEl.textContent = fmt(audio.duration);
  });

  audio.addEventListener("timeupdate", function () {
    if (!dragging && isFinite(audio.duration) && audio.duration > 0) {
      seek.value = Math.round((audio.currentTime / audio.duration) * 1000);
      curEl.textContent = fmt(audio.currentTime);
    }
    var now = Date.now();
    if (now - lastSave > 1000) {
      lastSave = now;
      saveState();
    }
  });

  audio.addEventListener("play", function () {
    playBtn.innerHTML = ICONS.pause;
    playBtn.title = "Pause";
    playBtn.setAttribute("aria-label", "Pause");
    player.classList.add("is-playing");
    updateLabel();
  });

  audio.addEventListener("playing", function () {
    if (toastedIndex !== index) {
      toastedIndex = index;
      showToast("Now listening to: " + track().title + " by " + ARTIST);
    }
  });

  audio.addEventListener("pause", function () {
    playBtn.innerHTML = ICONS.play;
    playBtn.title = "Play";
    playBtn.setAttribute("aria-label", "Play");
    player.classList.remove("is-playing");
    updateLabel();
    saveState();
  });

  audio.addEventListener("ended", function () {
    loadTrack(index + 1, 0);
    play();
  });

  audio.addEventListener("error", function () {
    player.classList.add("has-error");
    labelEl.textContent = "Missing song file: " + track().file;
  });

  window.addEventListener("pagehide", saveState);

  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.setActionHandler("play", play);
      navigator.mediaSession.setActionHandler("pause", pause);
      navigator.mediaSession.setActionHandler("previoustrack", function () { act("prev"); });
      navigator.mediaSession.setActionHandler("nexttrack", function () { act("next"); });
      navigator.mediaSession.setActionHandler("seekbackward", function () { act("rew"); });
      navigator.mediaSession.setActionHandler("seekforward", function () { act("ff"); });
    } catch (e) {
      /* not supported - ignore */
    }
  }

  /* ---------- Start ---------- */

  if (saved && TRACKS[saved.i]) {
    // Coming from another page on the site: pick up where the song left off.
    loadTrack(saved.i, saved.t || 0);
    if (saved.playing) play();
  } else {
    // First visit: start with the first song in the list.
    loadTrack(0, 0);
    play();
  }
})();
