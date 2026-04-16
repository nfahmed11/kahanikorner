// ═══════════════════════════════════════════════════
//  FALLING WORDS — Kahani Korner
//  Polished mobile-first vocabulary game
//  Vanilla JS · ES Modules · No frameworks
// ═══════════════════════════════════════════════════

import { vocab as masterVocab } from "./vocab.js";

// ═══════════════════════════════════════════════════
//  CONFIGURATION — easy to tweak
// ═══════════════════════════════════════════════════
const CFG = {
  maxLives: 3,
  scorePerCorrect: 10,
  wrongPenalty: 5,
  streakBonusAt: 3, // streak length that triggers bonus
  streakBonusPerLevel: 5, // extra points added per streak count above threshold
  levelUpEvery: 5, // correct answers to trigger level-up
  maxSpeed: 360, // px/s hard cap
  lsKey: "fw_best_score",
  boxPadH: 52, // approximate box height for stagger calcs
};

// ═══════════════════════════════════════════════════
//  KAWAII SVG ICONS — no phone-keyboard emojis
// ═══════════════════════════════════════════════════
const ICONS = {
  cloud1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 70" style="width:100%;height:100%;display:block" fill="none">
  <path d="M33 56h51c14 0 25-9 25-21s-10-21-23-21h-2C79 6 69 1 57 1 40 1 27 11 23 25 11 26 2 35 2 46c0 6 3 10 8 10h23Z"
        fill="rgba(255,255,255,0.72)"/>
</svg>`,

  cloud2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 80" style="width:100%;height:100%;display:block" fill="none">
  <path d="M30 63h76c18 0 32-11 32-25 0-13-11-24-27-25C106 5 95 0 82 0 61 0 44 12 39 29 21 30 7 42 7 56c0 4 1 7 3 7h20Z"
        fill="rgba(255,255,255,0.62)"/>
</svg>`,

  cloud3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 110 64" style="width:100%;height:100%;display:block" fill="none">
  <path d="M26 52h56c14 0 25-9 25-20 0-11-10-19-23-20C80 4 71 0 60 0 44 0 31 10 27 23 14 24 4 34 4 44c0 5 2 8 6 8h16Z"
        fill="rgba(255,255,255,0.68)"/>
</svg>`,

  heart: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" style="width:100%;height:100%;display:block">
  <path d="M40.69,6.35c-.71,0-1.37,.33-1.8,.9l-6.9,9.15-4.29,15.82,4.29,25.4c.31,.01,.61-.09,.86-.28l25.28-21.12c.28-.24,.5-.53,.65-.87l-6.59-11.79,6.59-7.16c-.11-.32-.27-.62-.47-.89l-6.25-8.26c-.43-.56-1.09-.89-1.8-.89h-9.58Z" fill="#ffa6c5"/>
  <path d="M13.73,6.35c-.71,0-1.37,.33-1.8,.89L5.68,15.5c-.2,.27-.36,.57-.47,.89l10.85,5.37-10.84,13.58c.15,.34,.37,.63,.64,.87l25.28,21.12c.25,.19,.55,.29,.86,.28V16.4l-6.9-9.15c-.42-.56-1.09-.9-1.8-.9H13.73Z" fill="#fd91ba"/>
  <path d="M32,16.4H5.21c-.13,.36-.2,.74-.21,1.12v16.86c0,.34,.08,.67,.22,.97l26.78-18.95Z" fill="#ffa6c5"/>
  <path d="M32,16.4l26.79,18.96c.14-.31,.21-.64,.21-.97V17.52c0-.38-.07-.76-.21-1.12h-26.79Z" fill="#ffd0e0"/>
  <path d="M32,16.4L5.22,35.35h0c.15,.34,.37,.64,.64,.88l4.55,3.8,21.59-23.63Z" fill="#fc76a8"/>
  <path d="M32,16.4l26.78,18.95h0c-.15,.34-.37,.64-.64,.88l-4.55,3.8-21.59-23.63Z" fill="#fd91ba"/>
  <path d="M52.87,6.64c-.61-.81-1.58-1.29-2.6-1.29h-9.58c-1.01,0-1.98,.48-2.6,1.29l-6.1,8.09-6.1-8.09c-.61-.81-1.58-1.29-2.6-1.29H13.73c-1.01,0-1.98,.48-2.6,1.29L4.88,14.9c-.57,.75-.88,1.68-.88,2.62v16.86c0,1.01,.44,1.96,1.22,2.61l25.28,21.12c.43,.36,.97,.54,1.5,.54s1.07-.18,1.5-.54l25.28-21.12c.78-.65,1.22-1.6,1.22-2.61V17.52c0-.94-.31-1.87-.88-2.62l-6.25-8.26Zm-17.72,10.76h22.81s.04,.08,.04,.12v16.05l-22.86-16.17Zm4.55-9.55c.24-.31,.61-.5,1-.5h9.58c.39,0,.77,.19,1,.5l5.72,7.55h-22.98l5.69-7.55Zm-26.97,0c.24-.31,.61-.5,1-.5h9.58c.39,0,.76,.19,1,.5l5.69,7.55H7.01l5.72-7.55Zm-6.73,25.72V17.52s.04-.08,.04-.12H28.86L6,33.57Zm.64,2L31,18.33V55.92L6.64,35.57Zm26.36,20.35V18.33l24.36,17.24-24.36,20.36Z" fill="#1f1f1f"/>
</svg>`,

  heartDead: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512.995 512.995" style="width:100%;height:100%;display:block">
  <g transform="translate(0 1)">
    <path fill="#E2E3E5" d="M274.062,113.749c18.963-45.511,62.578-76.8,113.778-76.8c68.267,0,117.57,58.785,124.207,128 c0,0,3.793,17.067-3.793,48.356c-10.43,42.667-33.185,80.593-65.422,109.037l-168.77,150.756L108.136,323.29 c-32.237-28.444-54.993-66.37-65.422-109.037c-7.585-31.289-3.793-48.356-3.793-48.356C44.61,95.735,93.914,36.949,163.129,36.949 C213.38,36.949,254.151,69.187,274.062,113.749"/>
    <path fill="#CCCCCC" d="M243.721,113.749c18.963-45.511,62.578-76.8,113.778-76.8c68.267,0,117.57,58.785,124.207,128 c0,0,3.793,17.067-3.793,48.356c-10.43,42.667-33.185,80.593-65.422,109.037l-168.77,150.756L77.795,323.29 c-32.237-28.444-54.993-66.37-65.422-109.037c-7.585-31.289-3.793-48.356-3.793-48.356C15.217,95.735,64.521,36.949,132.788,36.949 C183.988,36.949,224.758,69.187,243.721,113.749"/>
    <path fill="#E2E3E5" d="M240.877,113.749c18.963-45.511,37.926-76.8,89.126-76.8c68.267,0,117.57,58.785,124.207,128 c0,0,3.793,17.067-3.793,48.356c-10.43,42.667-33.185,80.593-65.422,109.037L240.877,473.098L75.899,323.29 c-32.237-28.444-51.2-66.37-61.63-109.037c-7.585-31.289-3.793-48.356-3.793-48.356c5.689-70.163,51.2-128.948,120.415-128.948 C181.143,36.949,221.914,69.187,240.877,113.749"/>
    <path fill="#FFFFFF" d="M10.477,165.898C16.166,95.735,65.469,36.949,134.684,36.949c4.741,0,8.533,0,13.274,0.948 c-61.63,7.585-105.244,62.578-110.933,128c0,0-3.793,17.067,3.793,48.356c10.43,42.667,33.185,80.593,65.422,109.037 l142.222,148.859l-0.948,0.948L79.692,323.29c-32.237-28.444-54.993-66.37-65.422-109.037 C6.684,182.964,10.477,165.898,10.477,165.898"/>
    <path fill="#B6B6B6" d="M245.617,482.579c-1.896,0-4.741-0.948-6.637-2.844L73.054,329.927 c-34.133-31.289-57.837-70.163-68.267-113.778c-6.637-30.341-4.741-48.356-3.793-52.148 C7.632,85.305,64.521,27.468,134.684,27.468c46.459,0,87.23,24.652,110.933,65.422c23.704-40.77,67.319-65.422,113.778-65.422 c70.163,0,126.104,57.837,133.689,136.533c0.948,3.793,2.844,21.807-3.793,52.148c-10.43,43.615-34.133,82.489-68.267,113.778 L251.306,480.683C249.41,481.631,247.514,482.579,245.617,482.579z M134.684,46.431c-60.681,0-109.037,50.252-114.726,120.415 v0.948c0,0-2.844,16.119,3.793,44.563c9.481,39.822,31.289,75.852,62.578,104.296l159.289,144.119l162.133-144.119 c31.289-28.444,53.096-64.474,62.578-104.296c6.637-28.444,3.793-44.563,3.793-44.563 c-6.637-71.111-54.993-121.363-115.674-121.363c-45.511,0-86.281,27.496-105.244,71.111c-1.896,3.793-4.741,5.689-8.533,5.689 s-7.585-1.896-8.533-5.689C218.121,73.927,178.299,46.431,134.684,46.431z"/>
    <path fill="#B6B6B6" d="M246.566,483.527c-0.948,0-1.896,0-2.844-0.948c-4.741-1.896-7.585-6.637-5.689-12.326 l36.03-107.141l-69.215-43.615c-2.844-1.896-3.793-3.793-4.741-7.585c0-2.844,0.948-5.689,2.844-7.585l98.607-91.022 l-122.311-14.222c-3.793,0-6.637-2.844-7.585-5.689c-0.948-2.844-0.948-6.637,1.896-9.481l66.37-75.852 c3.793-3.793,9.481-4.741,13.274-0.948s4.741,9.481,0.948,13.274l-54.993,62.578l124.207,16.119 c3.793,0.948,6.637,2.844,7.585,6.637c0.948,3.793,0,7.585-2.844,9.481L223.81,310.964l65.422,40.77 c3.793,1.896,5.689,6.637,3.793,11.378L255.099,476.89C254.151,480.683,250.358,483.527,246.566,483.527z"/>
  </g>
</svg>`,

  

  flame: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 34" style="width:100%;height:100%"><path d="M14 2C14 2 21 9 19 16 22 12 21 7 21 7 24 13 23 20 19 26 17.5 28.5 16 30 14 30 12 30 10.5 28.5 9 26 5 20 4 13 7 7 7 7 6 12 9 16 7 9 14 2Z" fill="#fb923c" stroke="#ea580c" stroke-width="1"/><path d="M14 11C14 11 17.5 15 16.5 20 19 17 18 13 18 13 20 18 19 23 16.5 26.5 15.5 28 14 28.5 12.5 28 11 26.5 8 23 7 18 9 13 9 13 8 17 11 20 8.5 15 14 11Z" fill="#fde68a" opacity=".85"/><circle cx="11.5" cy="20.5" r="1.9" fill="white" opacity=".9"/><circle cx="16.5" cy="20.5" r="1.9" fill="white" opacity=".9"/><circle cx="12" cy="21" r="1.1" fill="#1a1a1a"/><circle cx="17" cy="21" r="1.1" fill="#1a1a1a"/><path d="M11 24.5q3 2 6 0" stroke="#c2410c" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>`,

  lightning: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 34" style="width:100%;height:100%"><path d="M17 2L6 19h8l-3 13L24 15h-8Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.3" stroke-linejoin="round"/><circle cx="11" cy="13" r="1.6" fill="white" opacity=".9"/><circle cx="16" cy="11" r="1.6" fill="white" opacity=".9"/><circle cx="11.4" cy="13.4" r="0.9" fill="#1a1a1a"/><circle cx="16.4" cy="11.4" r="0.9" fill="#1a1a1a"/></svg>`,

  sparkle: `<svg height="200px" width="200px" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 508.068 508.068" xml:space="preserve" fill="#c8865b" stroke="#c8865b"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"> <path style="fill:#FFC52F;" d="M111.713,322.434c0.4,0.4,0.8,1.2,0.4,1.6l-20.4,120.8c-2.8,16.4-0.4,30,6.4,38.4 c4.8,5.6,11.6,8.4,20,8.4c8,0,17.6-2.8,27.6-8l108.4-57.2c0.4-0.4,1.2-0.4,2,0l108.4,56.8c10,5.2,19.2,8,27.2,8l0,0 c8.4,0,15.2-2.8,20-8.4c6.8-8,9.2-21.6,6-38.4l-21.2-120.8c0-0.8,0-1.2,0.4-1.6l87.6-85.6c14.4-14,20.4-28.4,16.4-40 c-4-12-17.2-20-36.8-22.8l-121.2-17.2c-0.8,0-1.2-0.4-1.6-1.2l-54.4-109.6c-8.8-18-20.8-28-33.2-28s-24,10-33.2,28l-54,110 c-0.4,0.4-0.8,0.8-1.6,1.2l-121.2,18c-20,2.8-32.8,11.2-36.8,22.8c-4,11.6,2,25.6,16,39.6h0.4c0.4,0,0.4,0.4,0.8,0.8 L111.713,322.434z"></path> <path d="M118.113,497.634c-7.2,0-14-2-19.2-6c-12-8.8-16.4-25.6-12.8-48l20-118.8l-86.4-83.6l0,0l0,0l-2.8-2.8 c-0.4-0.4-0.4-0.4-0.8-0.8c-13.6-14.8-18.8-29.6-14.8-42.8c4.4-14,19.2-23.6,41.6-27.2l119.2-17.6l52.8-108 c10-20.4,23.6-31.6,38.4-31.6l0,0c14.8,0,28.4,11.2,38.4,31.2l53.6,107.6l119.2,16.8c22.4,3.2,37.2,12.8,42,26.8s-1.6,30.4-18,46.4 l-86,84.4l20.8,118.4c4,22.4-0.4,39.2-12.4,48s-29.6,8-49.6-2.8l-106.8-55.6l-106.4,56.4 C137.313,494.834,127.313,497.634,118.113,497.634z M24.913,235.634l88,85.2c0.8,0.8,1.2,2.4,1.2,3.6l-20.4,120.8 c-3.2,19.2,0,33.2,9.6,40s24,5.6,41.2-3.6l108.4-57.2c1.2-0.8,2.4-0.8,3.6,0l108.4,56.8c17.2,8.8,31.6,10,41.2,3.2 c9.2-6.8,12.8-21.2,9.2-40.4l-21.2-120.8c-0.4-1.2,0-2.8,1.2-3.6l87.6-85.6c14-13.6,19.6-27.2,16-38c-3.6-11.2-16-18.8-35.2-21.2 l-121.2-17.2c-1.2,0-2.4-1.2-3.2-2l-54.4-109.6c-8.8-17.2-19.6-26.8-31.2-26.8l0,0c-11.6,0-22.8,9.6-31.2,27.2l-54,110 c-0.4,1.2-1.6,2-3.2,2l-30,4.4l0,0l-90.8,13.6c-19.2,2.8-31.6,10.4-35.2,21.6C5.713,208.834,11.313,222.434,24.913,235.634z"></path> <path d="M22.513,242.834c-0.8,0-2-0.4-2.8-1.2l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l0,0l-2.8-2.8 c-1.6-1.6-1.6-4,0-5.6s4-1.6,5.6,0l2.4,2.4l0,0l0.4,0.4l0,0l0,0l0,0l0,0l0,0l0,0l0,0c1.6,1.6,1.6,4,0,5.6 C24.513,242.434,23.313,242.834,22.513,242.834z"></path> </g></svg>`,

  // theme chip icons
  sun: `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--twemoji" preserveAspectRatio="xMidYMid meet" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="#FFAC33" d="M16 2s0-2 2-2s2 2 2 2v2s0 2-2 2s-2-2-2-2V2zm18 14s2 0 2 2s-2 2-2 2h-2s-2 0-2-2s2-2 2-2h2zM4 16s2 0 2 2s-2 2-2 2H2s-2 0-2-2s2-2 2-2h2zm5.121-8.707s1.414 1.414 0 2.828s-2.828 0-2.828 0L4.878 8.708s-1.414-1.414 0-2.829c1.415-1.414 2.829 0 2.829 0l1.414 1.414zm21 21s1.414 1.414 0 2.828s-2.828 0-2.828 0l-1.414-1.414s-1.414-1.414 0-2.828s2.828 0 2.828 0l1.414 1.414zm-.413-18.172s-1.414 1.414-2.828 0s0-2.828 0-2.828l1.414-1.414s1.414-1.414 2.828 0s0 2.828 0 2.828l-1.414 1.414zm-21 21s-1.414 1.414-2.828 0s0-2.828 0-2.828l1.414-1.414s1.414-1.414 2.828 0s0 2.828 0 2.828l-1.414 1.414zM16 32s0-2 2-2s2 2 2 2v2s0 2-2 2s-2-2-2-2v-2z"></path><circle fill="#FFAC33" cx="18" cy="18" r="10"></circle></g></svg>`,

  candy: `<svg viewBox="0 0 1024 1024" class="icon" version="1.1" xmlns="http://www.w3.org/2000/svg" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path d="M537.225476 296.123203s96.447809-86.32994 130.715039-154.104697c28.603987-41.219668 49.564896-143.376764-37.708918-97.437725-34.750678 18.290437-53.30586 56.655462-103.147011-15.309176-10.302039-14.883282-37.847046-60.937427-69.156037 6.238777 0.471937 3.994199-29.651457 49.967769-80.309865 8.207099 0 0-77.121413-50.117408-70.364657 26.670196 5.444542 21.50191 3.222984 110.502323 117.109441 200.907036zM535.176579 727.853476s96.459319 86.32994 130.726549 154.104697c28.592476 41.219668 49.564896 143.376764-37.708917 97.437726-34.762189-18.290437-53.30586-56.655462-103.147012 15.309176-10.359593 14.883282-37.847046 61.006491-69.156037-6.238777 0.471937-3.982688-29.662967-49.967769-80.321376-8.2071 0 0-77.121413 50.117408-70.364656-26.670196 5.456052-21.4904 3.222984-110.502323 117.109441-200.907035z" fill="#F09AC1"></path><path d="M531.942084 291.956345s84.545788-75.68258 114.577095-135.077579c25.070214-36.131957 43.452736-125.673371-33.047101-85.409087-30.468713 16.034347-46.733274 49.656981-90.416223-13.421428-9.035867-13.041576-33.173718-53.420967-60.626639 5.467563 0.414384 3.453198-25.991067 43.798056-70.399188 7.194162 0 0-67.613609-43.924673-61.674109 23.378147 4.776923 18.842948 2.820111 96.850682 102.652054 176.113077zM528.120545 739.571326s84.545788 75.694091 114.577096 135.08909c25.070214 36.131957 43.452736 125.673371-33.047101 85.409087-30.468713-16.034347-46.733274-49.668492-90.416224 13.421428-9.035867 13.041576-33.173718 53.420967-60.626638-5.479074 0.414384-3.453198-25.991067-43.740503-70.399189-7.182651 0 0-67.613609 43.924673-61.674108-23.389658 4.776923-18.831437 2.820111-96.850682 102.652053-176.113077z" fill="#E772AC"></path><path d="M374.717998 132.245957a344.65214 344.65214 0 0 0 76.177538 129.563973c1.530918 1.634514 3.959667-0.817257 2.44026-2.44026a340.588878 340.588878 0 0 1-75.279707-128.044566c-0.69064-2.106451-4.01722-1.151066-3.338091 0.920853zM486.647642 87.803304a630.208559 630.208559 0 0 1-7.102076 166.90455c-0.391362 2.175514 2.935218 3.107878 3.32658 0.909342a633.155288 633.155288 0 0 0 7.228693-167.756339c-0.195681-2.198536-3.648879-2.210046-3.453197 0zM617.535341 114.968458c-9.208527 27.625581-21.593996 53.9965-35.084487 79.768864-6.607118 12.661724-13.467471 25.070214-20.316313 37.536258s-14.112067 24.978129-24.379575 35.11902c-1.588471 1.56545 0.851789 4.005709 2.44026 2.440259 9.530825-9.415719 16.506284-20.719186 23.021317-32.356461q10.84304-19.418481 21.225654-39.136239c14.054514-26.601132 26.969473-53.881393 36.431235-82.496891 0.70215-2.117961-2.635941-3.015793-3.32658-0.909342zM380.599944 928.449724a340.565856 340.565856 0 0 1 75.291218-128.033056c1.519407-1.634514-0.920853-4.074773-2.44026-2.45177a344.629119 344.629119 0 0 0-76.177538 129.575484c-0.69064 2.117961 2.647451 3.027303 3.32658 0.909342zM492.644695 971.971524a633.178309 633.178309 0 0 0-7.228694-167.756339c-0.379852-2.187025-3.706432-1.254662-3.32658 0.920853a629.633026 629.633026 0 0 1 7.102076 166.835486c-0.195681 2.221557 3.257516 2.198536 3.453198 0zM623.405777 943.897027c-9.208527-27.947879-21.801187-54.560522-35.429807-80.57461-6.906395-13.191215-14.077535-26.232791-21.271697-39.262856-6.733735-12.23583-13.962429-24.172383-23.965192-34.094571-1.57696-1.56545-4.028731 0.87481-2.440259 2.440259 9.807081 9.691975 16.794051 21.421336 23.42419 33.38091q10.359593 18.589714 20.27027 37.375109c13.927897 26.336387 26.716239 53.328881 36.085915 81.668123 0.69064 2.09494 4.028731 1.151066 3.32658-0.920853z" fill="#FCC3DF"></path><path d="M228.923996 519.890407a283.887373 274.287484 90 1 0 548.574968 0 283.887373 274.287484 90 1 0-548.574968 0Z" fill="#F6B1D0"></path><path d="M229.246294 521.593984a265.896214 256.90639 90 1 0 513.812779 0 265.896214 256.90639 90 1 0-513.812779 0Z" fill="#FCD2E8"></path><path d="M324.473973 652.907578c16.517795 22.158018 35.521892 42.255628 59.25687 56.736036a167.986552 167.986552 0 0 0 75.970347 23.677425c2.233068 0.149639 2.210046-3.303559 0-3.453198a167.169295 167.169295 0 0 1-74.220727-23.205488c-23.274552-13.81279-41.956351-33.967954-58.013719-55.504395-1.312215-1.761131-4.316497 0-2.981261 1.74962z" fill="#FFFFFF"></path></g></svg>`,

  leaf: `<svg viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="iconify iconify--twemoji" preserveAspectRatio="xMidYMid meet" fill="#000000"><g id="SVGRepo_bgCarrier" stroke-width="0"></g><g id="SVGRepo_tracerCarrier" stroke-linecap="round" stroke-linejoin="round"></g><g id="SVGRepo_iconCarrier"><path fill="#A6D388" d="M6.401 28.55c5.006 5.006 16.502 11.969 29.533-.07c-7.366-1.417-8.662-10.789-13.669-15.794c-5.006-5.007-11.991-6.139-16.998-1.133c-5.006 5.006-3.873 11.99 1.134 16.997z"></path><path fill="#77B255" d="M24.684 29.81c6.128 1.634 10.658-.738 11.076-1.156c0 0-3.786 1.751-10.359-1.476c.952-1.212 3.854-2.909 3.854-2.909c-.553-.346-4.078-.225-6.485 1.429a37.028 37.028 0 0 1-3.673-2.675l.84-.871c3.25-3.384 6.944-2.584 6.944-2.584c-.638-.613-5.599-3.441-9.583.7l-.613.638a54.727 54.727 0 0 1-1.294-1.25l-1.85-1.85l1.064-1.065c3.321-3.32 8.226-3.451 8.226-3.451c-.626-.627-6.863-2.649-10.924 1.412l-.736.735l-8.292-8.294c-.626-.627-1.692-.575-2.317.05c-.626.626-.677 1.691-.051 2.317l8.293 8.293l-.059.059C4.684 21.924 6.37 28.496 6.997 29.123c0 0 .468-5.242 3.789-8.562l.387-.388l3.501 3.502c.057.057.113.106.17.163c-2.425 4.797 1.229 10.34 1.958 10.784c0 0-1.465-4.723.48-8.635c1.526 1.195 3.02 2.095 4.457 2.755c.083 2.993 2.707 5.7 3.344 5.931c0 0-.911-3.003-.534-4.487l.135-.376z"></path><path d="M22.083 10a1.001 1.001 0 0 1-.375-1.927c.166-.068 4.016-1.698 4.416-6.163a1 1 0 1 1 1.992.178c-.512 5.711-5.451 7.755-5.661 7.839a.978.978 0 0 1-.372.073zm5 4a1 1 0 0 1-.334-1.942c.188-.068 4.525-1.711 5.38-8.188a.99.99 0 0 1 1.122-.86a.998.998 0 0 1 .86 1.122c-1.021 7.75-6.468 9.733-6.699 9.813c-.109.037-.22.055-.329.055zm3.001 6a1.001 1.001 0 0 1-.483-1.876c.027-.015 2.751-1.536 3.601-3.518a1 1 0 0 1 1.837.788c-1.123 2.62-4.339 4.408-4.475 4.483a1.003 1.003 0 0 1-.48.123z" fill="#42743e"></path></g></svg>`,

  trophy: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 34" style="width:100%;height:100%"><path d="M7 3h16v14c0 5.5-3.5 9-8 9S7 22.5 7 17Z" fill="#fbbf24" stroke="#d97706" stroke-width="1.3"/><path d="M7 6C7 6 2 6 2 12c0 4 4 5 5 4.5" stroke="#d97706" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M23 6c0 0 5 0 5 6 0 4-4 5-5 4.5" stroke="#d97706" stroke-width="2" fill="none" stroke-linecap="round"/><rect x="11" y="26" width="8" height="3" rx="1" fill="#d97706"/><rect x="9" y="29" width="12" height="2.5" rx="1" fill="#b45309"/><circle cx="12.5" cy="18.5" r="1.6" fill="white"/><circle cx="17.5" cy="18.5" r="1.6" fill="white"/><circle cx="13" cy="19" r="0.9" fill="#1a1a2e"/><circle cx="18" cy="19" r="0.9" fill="#1a1a2e"/><path d="M12 22.5q3 2 6 0" stroke="#92400e" stroke-width="1.1" stroke-linecap="round" fill="none"/></svg>`,

  sadFace: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" style="width:100%;height:100%"><circle cx="17" cy="17" r="15.5" fill="#fde68a" stroke="#f59e0b" stroke-width="1.5"/><path d="M10.5 12.5c0 0 1-2 2.5-1" stroke="#555" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M21 12.5c0 0 1-2 2.5-1" stroke="#555" stroke-width="1.5" stroke-linecap="round" fill="none"/><path d="M10 23q7-5 14 0" stroke="#92400e" stroke-width="1.6" stroke-linecap="round" fill="none"/><ellipse cx="10.5" cy="19" rx="2.8" ry="1.6" fill="#fca5a5" opacity=".55"/><ellipse cx="23.5" cy="19" rx="2.8" ry="1.6" fill="#fca5a5" opacity=".55"/><path d="M11.5 15L10.5 19" stroke="#60a5fa" stroke-width="1.5" stroke-linecap="round"/><ellipse cx="10" cy="19.5" rx="1.3" ry="1.8" fill="#60a5fa" opacity=".7"/></svg>`,

  happyFace: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" style="width:100%;height:100%"><circle cx="17" cy="17" r="15.5" fill="#fde68a" stroke="#f59e0b" stroke-width="1.5"/><circle cx="12" cy="15" r="3" fill="white"/><circle cx="22" cy="15" r="3" fill="white"/><circle cx="12.5" cy="15.5" r="1.7" fill="#1a1a2e"/><circle cx="22.5" cy="15.5" r="1.7" fill="#1a1a2e"/><circle cx="13" cy="14.8" r="0.6" fill="white"/><circle cx="23" cy="14.8" r="0.6" fill="white"/><path d="M9 21q8 6 16 0" stroke="#92400e" stroke-width="1.7" stroke-linecap="round" fill="none"/><ellipse cx="8.5" cy="19" rx="2.8" ry="1.6" fill="#fca5a5" opacity=".55"/><ellipse cx="25.5" cy="19" rx="2.8" ry="1.6" fill="#fca5a5" opacity=".55"/></svg>`,

  pauseFace: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" style="width:100%;height:100%"><circle cx="17" cy="17" r="15.5" fill="#fde68a" stroke="#f59e0b" stroke-width="1.5"/><path d="M11 13.5q1.5 2.5 4 0" stroke="#555" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M19 13.5q1.5 2.5 4 0" stroke="#555" stroke-width="1.8" stroke-linecap="round" fill="none"/><path d="M13 21q4 2.5 8 0" stroke="#92400e" stroke-width="1.4" stroke-linecap="round" fill="none"/><ellipse cx="10.5" cy="19" rx="2.8" ry="1.6" fill="#fca5a5" opacity=".5"/><ellipse cx="23.5" cy="19" rx="2.8" ry="1.6" fill="#fca5a5" opacity=".5"/><text x="26" y="11" font-size="7" fill="#a78bfa" font-family="sans-serif" font-weight="bold" opacity=".9">z</text><text x="23.5" y="7.5" font-size="5.5" fill="#a78bfa" font-family="sans-serif" font-weight="bold" opacity=".8">z</text></svg>`,

  leaf1: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:100%;height:100%;display:block" fill="none">
  <path d="M12 21C7 18 4 14 4 10C4 6.5 6.8 4 10 4C11.7 4 13.2 4.7 14 5.2C14.8 4.7 16.3 4 18 4C21.2 4 24 6.5 24 10C24 14 17 21 12 21Z"
        fill="#a7f3d0" stroke="#34d399" stroke-width="1.2"/>
  <path d="M12 6V18" stroke="#059669" stroke-width="1" opacity=".45"/>
</svg>`,

  leaf2: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:100%;height:100%;display:block" fill="none">
  <path d="M5 14C9 6 18 5 20 10C22 15 13 21 5 14Z"
        fill="#86efac" stroke="#22c55e" stroke-width="1.2"/>
  <path d="M7 14L17 10" stroke="#15803d" stroke-width="1" opacity=".45"/>
</svg>`,

  leaf3: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:100%;height:100%;display:block" fill="none">
  <ellipse cx="12" cy="12" rx="7" ry="9"
           fill="#bbf7d0" stroke="#4ade80" stroke-width="1.2"/>
  <path d="M12 4.5V19" stroke="#166534" stroke-width="1" opacity=".45"/>
</svg>`,

  leaf4: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" style="width:100%;height:100%;display:block" fill="none">
  <path d="M12 21C8 18 6 14.5 6 10.5C6 7 8.5 4.5 12 4.5C15.5 4.5 18 7 18 10.5C18 14.5 16 18 12 21Z"
        fill="#6ee7b7" stroke="#10b981" stroke-width="1.2"/>
</svg>`,
};

// Theme → logo icon key
const THEME_ICON = {
  sky: "sun",
  candy: "candy",
  jungle: "leaf",
  stars: "sparkle",
};
// Theme chip → icon key
const THEME_CHIP_ICON = {
  sky: "sun",
  candy: "candy",
  jungle: "leaf",
  stars: "sparkle",
};
// Deco items in order: d1…d6
const DECO_ICONS = ["sun", "bird", "leaf", "candy", "sun", "sparkle"];

const DIFFICULTY_CFG = {
  easy: { startSpeed: 58, answerCount: 3, rampFactor: 0.04 },
  medium: { startSpeed: 95, answerCount: 4, rampFactor: 0.09 },
  hard: { startSpeed: 145, answerCount: 5, rampFactor: 0.14 },
};

// Each mode: source field, target field, direction label, urdu flags
const MODES = {
  "en-ro": {
    src: "english",
    tgt: "baseRomanUrdu",
    label: "Find the Roman Urdu:",
    srcUrdu: false,
    tgtUrdu: false,
  },
  "ro-en": {
    src: "baseRomanUrdu",
    tgt: "english",
    label: "Find the English:",
    srcUrdu: false,
    tgtUrdu: false,
  },
  "ro-ur": {
    src: "baseRomanUrdu",
    tgt: "baseUrdu",
    label: "Find the Urdu script:",
    srcUrdu: false,
    tgtUrdu: true,
  },
  "ur-ro": {
    src: "baseUrdu",
    tgt: "baseRomanUrdu",
    label: "Find the Roman Urdu:",
    srcUrdu: true,
    tgtUrdu: false,
  },
  "en-ur": {
    src: "english",
    tgt: "baseUrdu",
    label: "Find the Urdu script:",
    srcUrdu: false,
    tgtUrdu: true,
  },
  "ur-en": {
    src: "baseUrdu",
    tgt: "english",
    label: "Find the English:",
    srcUrdu: true,
    tgtUrdu: false,
  },
};

// ═══════════════════════════════════════════════════
//  GAME STATE — single source of truth
// ═══════════════════════════════════════════════════
const S = {
  // runtime
  screen: "menu",
  score: 0,
  streak: 0,
  lives: CFG.maxLives,
  level: 1,
  correctCount: 0,
  roundCount: 0,
  speed: 58,
  rafId: null,
  lastTs: null,
  fallingItems: [],
  roundActive: false,
  recentIds: [], // avoid same word repeating
  cdTimer: null,
  paused: false,

  // settings (persist across rounds)
  mode: "en-ro",
  difficulty: "easy",
  theme: "sky",
};

// ═══════════════════════════════════════════════════
//  AUDIO — lightweight optional hooks
// ═══════════════════════════════════════════════════
const SFX = { correct: null, wrong: null, miss: null };

function initAudio() {
  try {
    SFX.correct = new Audio("/qr/assets/audio/success.wav");
  } catch (_) {}
  try {
    SFX.wrong = new Audio("/qr/assets/audio/incorrect.wav");
  } catch (_) {}
  try {
    SFX.miss = new Audio("/qr/assets/audio/incorrect.wav");
  } catch (_) {}
}

function playCorrectSound() {
  if (!SFX.correct) return;
  try {
    SFX.correct.currentTime = 0;
    SFX.correct.play().catch(() => {});
  } catch (_) {}
}
function playWrongSound() {
  if (!SFX.wrong) return;
  try {
    SFX.wrong.currentTime = 0;
    SFX.wrong.play().catch(() => {});
  } catch (_) {}
}
function playMissSound() {
  if (!SFX.miss) return;
  try {
    SFX.miss.currentTime = 0;
    SFX.miss.play().catch(() => {});
  } catch (_) {}
}

// ═══════════════════════════════════════════════════
//  VOCAB HELPERS
// ═══════════════════════════════════════════════════
function field(entry, key) {
  return entry?.word?.[key]?.trim() || "";
}

function isValidForMode(entry, modeKey) {
  const m = MODES[modeKey];
  if (!m) return false;
  return field(entry, m.src).length > 0 && field(entry, m.tgt).length > 0;
}

/**
 * Build the playable vocab pool for the current mode:
 *   1. window.storyVocab   – injected by the host page
 *   2. window.ALLOWED_WORDS filtered from masterVocab
 *   3. full masterVocab (fallback)
 */
function buildPool() {
  let base = [];

  if (Array.isArray(window.storyVocab) && window.storyVocab.length > 0) {
    base = window.storyVocab;
  } else if (
    window.ALLOWED_WORDS instanceof Set &&
    window.ALLOWED_WORDS.size > 0
  ) {
    base = masterVocab.filter((e) => {
      const roman = e?.word?.baseRomanUrdu;
      return roman && window.ALLOWED_WORDS.has(roman);
    });
  } else {
    base = masterVocab;
  }

  // Keep only well-formed entries that work for the current mode
  return base.filter(
    (e) => e?.word?.baseRomanUrdu && isValidForMode(e, S.mode),
  );
}

// ═══════════════════════════════════════════════════
//  ROUND GENERATION
// ═══════════════════════════════════════════════════
function pickEntry(pool) {
  if (!pool.length) return null;
  // Prefer words not seen recently
  const fresh = pool.filter((e) => !S.recentIds.includes(e.id));
  const source = fresh.length > 0 ? fresh : pool;
  return source[Math.floor(Math.random() * source.length)];
}

function pickDistractors(entry, pool, count, tgtKey) {
  const correct = field(entry, tgtKey);
  const seen = new Set([correct]);
  const distractors = [];

  // Shuffle pool copy and pick unique targets
  const shuffled = shuffle([...pool]);
  for (const e of shuffled) {
    if (distractors.length >= count) break;
    const t = field(e, tgtKey);
    if (t && !seen.has(t)) {
      seen.add(t);
      distractors.push(t);
    }
  }

  // Pad with placeholder if pool is very small
  while (distractors.length < count) {
    distractors.push("…");
  }
  return distractors;
}

function generateRound(pool) {
  const m = MODES[S.mode];
  const dc = DIFFICULTY_CFG[S.difficulty];
  const entry = pickEntry(pool);
  if (!entry) return null;

  // Track recently used
  S.recentIds.push(entry.id);
  if (S.recentIds.length > 5) S.recentIds.shift();

  const promptText = field(entry, m.src);
  const correctAnswer = field(entry, m.tgt);
  const distractors = pickDistractors(entry, pool, dc.answerCount - 1, m.tgt);
  const answers = shuffle([correctAnswer, ...distractors]);

  return {
    promptText,
    correctAnswer,
    answers,
    srcUrdu: m.srcUrdu,
    tgtUrdu: m.tgtUrdu,
    dirLabel: m.label,
  };
}

// ═══════════════════════════════════════════════════
//  FALLING ITEMS RENDERING
// ═══════════════════════════════════════════════════
const fallZone = () => document.getElementById("fall-zone");

/**
 * Assign each item a random horizontal slot, using its actual rendered width
 * to clamp within the slot so nothing clips the edge.
 * items: array of { el } (already in DOM so offsetWidth is readable)
 */
function assignPositions(items, zoneW) {
  const count = items.length;
  const slotW = zoneW / count;
  // Random slot assignment
  const slots = shuffle(Array.from({ length: count }, (_, i) => i));

  return items.map((item, i) => {
    const slot = slots[i];
    const w = item.el.offsetWidth;
    const lo = slot * slotW + 8;
    const hi = (slot + 1) * slotW - w - 8;
    return Math.floor(lo + Math.random() * Math.max(0, hi - lo));
  });
}

function spawnRound(round) {
  clearFalling();

  // Prompt
  const pw = document.getElementById("prompt-word");
  pw.textContent = round.promptText;
  pw.className = "prompt-word" + (round.srcUrdu ? " is-urdu" : "");
  document.getElementById("prompt-dir").textContent = round.dirLabel;

  const zone = fallZone();
  const zoneW = zone.clientWidth;

  // Step 1 — create elements and append invisibly so we can measure their
  // natural (nowrap) rendered width before placing them.
  const items = round.answers.map((text, i) => {
    const el = document.createElement("div");
    el.className = "ans-box" + (round.tgtUrdu ? " is-urdu" : "");
    el.textContent = text;
    el.style.visibility = "hidden";
    el.style.top = "-200px";
    el.style.left = "0px";
    zone.appendChild(el);

    const startY = -(CFG.boxPadH + i * 100 + Math.random() * 50);
    return {
      el,
      y: startY,
      isCorrect: text === round.correctAnswer,
      text,
      answered: false,
    };
  });

  // Step 2 — read actual widths, assign non-overlapping slot positions.
  const positions = assignPositions(items, zoneW);

  items.forEach((item, i) => {
    const w = item.el.offsetWidth;
    item.el.style.left =
      Math.max(4, Math.min(positions[i], zoneW - w - 4)) + "px";
    item.el.style.top = item.y + "px";
    item.el.style.visibility = "";

    item.el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      onAnswerTap(item, e);
    });
  });

  S.fallingItems = items;
  S.roundActive = true;
}

function clearFalling() {
  S.fallingItems.forEach((it) => it.el?.remove());
  S.fallingItems = [];
  S.roundActive = false;
}

// ═══════════════════════════════════════════════════
//  ANIMATION LOOP
// ═══════════════════════════════════════════════════
function startLoop() {
  if (S.rafId) cancelAnimationFrame(S.rafId);
  S.lastTs = null;
  S.rafId = requestAnimationFrame(loopTick);
}

function stopLoop() {
  if (S.rafId) {
    cancelAnimationFrame(S.rafId);
    S.rafId = null;
  }
}

function loopTick(ts) {
  if (S.paused || S.screen !== "game") return;

  if (!S.lastTs) S.lastTs = ts;
  const dt = Math.min((ts - S.lastTs) / 1000, 0.05); // cap at 50ms frame
  S.lastTs = ts;

  if (S.roundActive) {
    const zone = fallZone();
    const zoneH = zone.clientHeight;

    for (const item of S.fallingItems) {
      if (item.answered) continue;

      item.y += S.speed * dt;
      item.el.style.top = item.y + "px";

      if (item.y >= zoneH) {
        item.answered = true; // mark before handler to prevent double-fire
        if (item.isCorrect) {
          onCorrectMissed(item);
        } else {
          item.el.remove();
        }
      }
    }
  }

  S.rafId = requestAnimationFrame(loopTick);
}

// ═══════════════════════════════════════════════════
//  TAP HANDLING
// ═══════════════════════════════════════════════════
function onAnswerTap(item, e) {
  if (!S.roundActive || item.answered || S.paused) return;
  item.answered = true;

  const rect = item.el.getBoundingClientRect();
  const px = rect.left + rect.width / 2;
  const py = rect.top;

  if (item.isCorrect) {
    handleCorrect(item, px, py);
  } else {
    handleWrong(item, px, py);
  }
}

function handleCorrect(item, px, py) {
  playCorrectSound();

  S.streak++;
  S.correctCount++;

  // Points with streak bonus
  const bonus =
    S.streak >= CFG.streakBonusAt
      ? (S.streak - CFG.streakBonusAt + 1) * CFG.streakBonusPerLevel
      : 0;
  const points = CFG.scorePerCorrect + bonus;
  S.score += points;

  // Floating score label
  showPop(`+${points}`, px - 20, py, false);
  if (S.streak >= 3) {
    showPop(`Combo ×${S.streak}!`, px - 36, py - 34, true);
  }

  // Visual pop on the box
  item.el.classList.add("correct-pop");

  // Freeze remaining items
  S.roundActive = false;
  S.fallingItems.forEach((it) => {
    it.answered = true;
  });

  // Level up?
  if (S.correctCount > 0 && S.correctCount % CFG.levelUpEvery === 0) {
    doLevelUp();
  }

  updateHUD();
  S.roundCount++;

  setTimeout(() => {
    item.el.remove();
    clearFalling();
    setTimeout(nextRound, 180);
  }, 420);
}

function handleWrong(item, px, py) {
  playWrongSound();
  S.streak = 0;

  item.el.classList.add("wrong-shake");
  showPop(`−${CFG.wrongPenalty}`, px - 14, py, false);
  S.score = Math.max(0, S.score - CFG.wrongPenalty);

  loseLife();
  updateHUD();

  // Round continues — player can still catch correct
  setTimeout(() => item.el?.classList.remove("wrong-shake"), 450);
}

function onCorrectMissed(item) {
  playMissSound();
  S.streak = 0;

  item.el.classList.add("miss-fade");
  S.roundActive = false;
  S.fallingItems.forEach((it) => {
    it.answered = true;
  });

  loseLife();
  updateHUD();
  S.roundCount++;

  setTimeout(() => {
    clearFalling();
    setTimeout(nextRound, 180);
  }, 380);
}

// ═══════════════════════════════════════════════════
//  LIVES & LEVEL
// ═══════════════════════════════════════════════════
function loseLife() {
  if (S.lives <= 0) return;
  S.lives--;

  // Animate the rightmost full heart
  const hearts = document.querySelectorAll(".heart:not(.dead)");
  if (hearts.length) {
    const last = hearts[hearts.length - 1];
    last.classList.add("pulse-anim");
    setTimeout(() => last.classList.remove("pulse-anim"), 380);
  }

  if (S.lives <= 0) {
    setTimeout(doGameOver, 550);
  }
}

function doLevelUp() {
  S.level++;
  const dc = DIFFICULTY_CFG[S.difficulty];
  // Speed increases geometrically per level, capped at CFG.maxSpeed
  S.speed = Math.min(
    dc.startSpeed * (1 + (S.level - 1) * dc.rampFactor * 8),
    CFG.maxSpeed,
  );

  // Brief green flash on prompt to signal level up
  const pw = document.getElementById("prompt-wrap");
  pw.style.transition = "background-color 0.25s";
  pw.style.backgroundColor = "rgba(34,197,94,0.25)";
  setTimeout(() => {
    pw.style.backgroundColor = "";
    setTimeout(() => {
      pw.style.transition = "";
    }, 260);
  }, 280);

  updateHUD();
}

// ═══════════════════════════════════════════════════
//  HUD
// ═══════════════════════════════════════════════════
function updateHUD() {
  document.getElementById("hud-score").textContent = S.score;
  document.getElementById("hud-level").textContent = S.level;
  renderLives();
  renderStreak();
}

function renderLives() {
  const el = document.getElementById("lives-row");
  let html = "";
  for (let i = 0; i < CFG.maxLives; i++) {
    const dead = i >= S.lives;
    html += `<span class="heart${dead ? " dead" : ""}">${dead ? ICONS.heartDead : ICONS.heart}</span>`;
  }
  el.innerHTML = html;
}

function renderStreak() {
  const el = document.getElementById("streak-badge");
  if (S.streak >= 5) {
    el.innerHTML = `<span class="streak-svg">${ICONS.flame}</span>×${S.streak} ON FIRE!`;
  } else if (S.streak >= 3) {
    el.innerHTML = `<span class="streak-svg">${ICONS.lightning}</span>Combo ×${S.streak}`;
  } else if (S.streak >= 2) {
    el.innerHTML = `<span class="streak-svg">${ICONS.sparkle}</span>×${S.streak}`;
  } else {
    el.innerHTML = "";
  }
}

// ═══════════════════════════════════════════════════
//  SCORE POP FLOATERS
// ═══════════════════════════════════════════════════
function showPop(text, x, y, isCombo) {
  const cont = document.getElementById("score-pops");
  const el = document.createElement("div");
  el.className = "score-pop" + (isCombo ? " is-combo" : "");
  el.textContent = text;
  el.style.left = Math.max(8, Math.min(x, window.innerWidth - 90)) + "px";
  el.style.top = y + "px";
  cont.appendChild(el);
  setTimeout(() => el.remove(), 980);
}

// ═══════════════════════════════════════════════════
//  ROUND MANAGEMENT
// ═══════════════════════════════════════════════════
function nextRound() {
  if (S.lives <= 0) return;

  const pool = buildPool();
  if (pool.length === 0) {
    document.getElementById("prompt-word").textContent =
      "⚠️ No vocab for this mode";
    document.getElementById("prompt-word").style.fontSize = "14px";
    return;
  }

  const round = generateRound(pool);
  if (!round) return;

  spawnRound(round);
}

// ═══════════════════════════════════════════════════
//  GAME FLOW
// ═══════════════════════════════════════════════════
function resetGameState() {
  const dc = DIFFICULTY_CFG[S.difficulty];
  S.score = 0;
  S.streak = 0;
  S.lives = CFG.maxLives;
  S.level = 1;
  S.correctCount = 0;
  S.roundCount = 0;
  S.speed = dc.startSpeed;
  S.fallingItems = [];
  S.roundActive = false;
  S.recentIds = [];
  S.paused = false;
  S.lastTs = null;
}

function startGame() {
  stopLoop();
  clearCdTimer();
  clearFalling();
  hideOverlays();
  resetGameState();
  updateHUD();

  document.getElementById("prompt-word").textContent = "—";
  document.getElementById("prompt-word").className = "prompt-word";
  document.getElementById("prompt-word").style.fontSize = "";

  doCountdown(() => {
    showScreen("game");
    startLoop();
    nextRound();
  });
}

function pauseGame() {
  if (S.screen !== "game" || S.paused) return;
  S.paused = true;
  showOverlay("pause");
}

function resumeGame() {
  if (!S.paused) return;
  S.paused = false;
  S.lastTs = null;
  hideOverlays();
  S.rafId = requestAnimationFrame(loopTick);
}

function doGameOver() {
  stopLoop();
  clearFalling();

  const isNew = saveBest(S.score);
  const best = getBest();

  document.getElementById("go-score").textContent = S.score;
  document.getElementById("go-caught").textContent = S.correctCount;
  document.getElementById("go-rounds").textContent = S.roundCount;
  document.getElementById("go-best").textContent = best;

  document.getElementById("new-best").classList.toggle("hidden", !isNew);

  const em = document.getElementById("go-emoji");
  em.innerHTML =
    S.score >= 150
      ? ICONS.trophy
      : S.score >= 60
        ? ICONS.happyFace
        : ICONS.sadFace;

  showOverlay("gameover");
  S.screen = "gameover";
}

function goToMenu() {
  stopLoop();
  clearCdTimer();
  clearFalling();
  hideOverlays();
  S.paused = false;

  document.getElementById("menu-best-val").textContent = getBest();
  showScreen("menu");
}

// ═══════════════════════════════════════════════════
//  COUNTDOWN
// ═══════════════════════════════════════════════════
function doCountdown(cb) {
  showScreen("countdown");
  const el = document.getElementById("cd-number");
  let n = 3;

  function setNum(val) {
    el.style.animation = "none";
    void el.offsetWidth; // trigger reflow to restart animation
    el.style.animation = "";
    el.textContent = val;
  }

  setNum(3);

  const tick = () => {
    n--;
    if (n > 0) {
      setNum(n);
      S.cdTimer = setTimeout(tick, 900);
    } else {
      setNum("Go!");
      S.cdTimer = setTimeout(cb, 720);
    }
  };
  S.cdTimer = setTimeout(tick, 900);
}

function clearCdTimer() {
  if (S.cdTimer) {
    clearTimeout(S.cdTimer);
    S.cdTimer = null;
  }
}

// ═══════════════════════════════════════════════════
//  SCREEN / OVERLAY HELPERS
// ═══════════════════════════════════════════════════
function showScreen(name) {
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  document.getElementById(`screen-${name}`)?.classList.add("active");
  S.screen = name;
}

function showOverlay(name) {
  hideOverlays();
  document.getElementById(`ov-${name}`)?.classList.remove("hidden");
}

function hideOverlays() {
  document
    .querySelectorAll(".overlay")
    .forEach((o) => o.classList.add("hidden"));
}

// ═══════════════════════════════════════════════════
//  BEST SCORE (localStorage)
// ═══════════════════════════════════════════════════
function getBest() {
  return parseInt(localStorage.getItem(CFG.lsKey) || "0", 10);
}

function saveBest(score) {
  if (score > getBest()) {
    localStorage.setItem(CFG.lsKey, String(score));
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════
//  THEME MANAGEMENT
// ═══════════════════════════════════════════════════
function applyTheme(name) {
  const body = document.getElementById("app-body");
  body.className = body.className.replace(/theme-\w+/g, "").trim();
  body.classList.add(`theme-${name}`);
  S.theme = name;

  // Update logo SVG
  const logoKey = THEME_ICON[name] || "star";
  document.getElementById("logo-icon").innerHTML = ICONS[logoKey];

  // Update theme chip icons
  document.querySelectorAll(".theme-chip").forEach((btn) => {
    const chipIcon = THEME_CHIP_ICON[btn.dataset.theme] || "star";
    const tc = btn.querySelector(".tc-icon");
    if (tc) tc.innerHTML = ICONS[chipIcon];
  });

  // Update floating menu deco items
  document.querySelectorAll(".deco").forEach((el, i) => {
    el.innerHTML = ICONS[DECO_ICONS[i % DECO_ICONS.length]];
  });

  injectBgDecorations(name);
}

function injectBgDecorations(theme) {
  document
    .querySelectorAll(".bg-star, .bg-cloud-svg, .bg-sprinkle, .bg-leaf")
    .forEach((el) => el.remove());

  if (theme === "stars") {
    for (let i = 0; i < 65; i++) {
      const s = document.createElement("div");
      const sz = 1.5 + Math.random() * 2.5;
      s.className = "bg-star";
      s.style.cssText = `
        left: ${Math.random() * 100}vw;
        top:  ${Math.random() * 100}vh;
        width:  ${sz}px;
        height: ${sz}px;
        --tw-dur:   ${1.5 + Math.random() * 2.5}s;
        --tw-delay: ${Math.random() * 3}s;
      `;
      document.body.appendChild(s);
    }
  }

  if (theme === "sky") {
    const clouds = ["cloud1", "cloud2", "cloud3", "cloud1", "cloud2", "cloud3"];
    const cloudData = [
      { size: 120, top: 8, dur: 32, delay: -4, opacity: 0.85 },
      { size: 92, top: 20, dur: 26, delay: -12, opacity: 0.7 },
      { size: 140, top: 34, dur: 38, delay: -8, opacity: 0.78 },
      { size: 80, top: 50, dur: 24, delay: -16, opacity: 0.62 },
      { size: 110, top: 66, dur: 34, delay: -20, opacity: 0.72 },
      { size: 95, top: 78, dur: 28, delay: -10, opacity: 0.6 },
    ];

    cloudData.forEach((cfg, i) => {
      const c = document.createElement("div");
      c.className = "bg-cloud-svg";
      c.innerHTML = ICONS[clouds[i % clouds.length]];
      c.style.cssText = `
      width: ${cfg.size}px;
      height: ${Math.round(cfg.size * 0.58)}px;
      top: ${cfg.top}%;
      left: -${cfg.size + 30}px;
      --cloud-dur: ${cfg.dur}s;
      --cloud-delay: ${cfg.delay}s;
      opacity: ${cfg.opacity};
    `;
      document.body.appendChild(c);
    });
  }

  if (theme === "candy") {
    const colors = [
      "#f472b6",
      "#fb923c",
      "#facc15",
      "#34d399",
      "#60a5fa",
      "#c084fc",
    ];
    for (let i = 0; i < 18; i++) {
      const sp = document.createElement("div");
      sp.className = "bg-sprinkle";
      sp.style.cssText = `
        left:  ${Math.random() * 100}vw;
        top:   -30px;
        background: ${colors[i % colors.length]};
        --sp-dur:   ${6 + Math.random() * 6}s;
        --sp-delay: ${-Math.random() * 8}s;
        --sp-rot:   ${Math.random() * 60 - 30}deg;
      `;
      document.body.appendChild(sp);
    }
  }

  if (theme === "jungle") {
    const leaves = ["leaf1", "leaf2", "leaf3", "leaf4"];
    for (let i = 0; i < 12; i++) {
      const lf = document.createElement("div");
      lf.className = "bg-leaf";
      lf.innerHTML = ICONS[leaves[i % leaves.length]];
      lf.style.cssText = `
        left:      ${Math.random() * 100}vw;
        top:       -40px;
        --lf-sz:   ${14 + Math.random() * 16}px;
        --lf-dur:  ${10 + Math.random() * 8}s;
        --lf-delay:${-Math.random() * 10}s;
      `;
      document.body.appendChild(lf);
    }
  }
}

// ═══════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ═══════════════════════════════════════════════════
//  EVENT WIRING
// ═══════════════════════════════════════════════════
function wireMenu() {
  // Start
  document.getElementById("start-btn").addEventListener("click", startGame);

  // Mode
  document.getElementById("mode-select").addEventListener("change", (e) => {
    S.mode = e.target.value;
  });

  // Difficulty
  document.getElementById("diff-group").addEventListener("click", (e) => {
    const btn = e.target.closest(".pill-btn");
    if (!btn) return;
    document
      .querySelectorAll(".pill-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    S.difficulty = btn.dataset.diff;
  });

  // Theme
  document.getElementById("theme-group").addEventListener("click", (e) => {
    const btn = e.target.closest(".theme-chip");
    if (!btn) return;
    document
      .querySelectorAll(".theme-chip")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    applyTheme(btn.dataset.theme);
  });
}

function wireGame() {
  document.getElementById("pause-btn").addEventListener("click", pauseGame);
  document.getElementById("btn-resume").addEventListener("click", resumeGame);
  document.getElementById("btn-p-restart").addEventListener("click", startGame);
  document.getElementById("btn-p-menu").addEventListener("click", goToMenu);
  document
    .getElementById("btn-go-restart")
    .addEventListener("click", startGame);
  document.getElementById("btn-go-menu").addEventListener("click", goToMenu);
}

function wireVisibility() {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && S.screen === "game" && !S.paused) {
      pauseGame();
    }
  });
}

/** Prevent page scroll during gameplay */
function wireScrollBlock() {
  document.addEventListener(
    "touchmove",
    (e) => {
      if (S.screen === "game") e.preventDefault();
    },
    { passive: false },
  );
}

// ═══════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════
function init() {
  initAudio();
  wireMenu();
  wireGame();
  wireVisibility();
  wireScrollBlock();

  // Inject static kawaii icons (these don't change with theme)

  const pauseOvEmoji = document.querySelector("#ov-pause .ov-emoji");
  if (pauseOvEmoji) pauseOvEmoji.innerHTML = ICONS.pauseFace;

  const mbIcon = document.getElementById("mb-trophy-icon");
  if (mbIcon) mbIcon.innerHTML = ICONS.trophy;

  document.getElementById("menu-best-val").textContent = getBest();
  applyTheme("sky"); // also injects logo, chip icons, deco icons
  showScreen("menu");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
