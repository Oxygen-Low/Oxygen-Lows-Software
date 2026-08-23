export interface BreadcrumbItem {
  name: string;
  url: string;
}

export interface InternalLinkItem {
  href: string;
  label: string;
  description?: string;
}

export interface RouteSeoData {
  path: string;
  title: string;
  description: string;
  canonicalPath: string;
  h1: string;
  h2?: string[];
  keywords?: string[];
  ogType?: "website" | "article";
  breadcrumbs?: BreadcrumbItem[];
  internalLinks?: InternalLinkItem[];
  softwareType?: string;
}

export const SITE_NAME = "Oxygen Low's Software";
export const DEFAULT_BASE_URL = "https://oxygenlow.com";
export const DEFAULT_OG_IMAGE = "https://oxygenlow.com/icons/icon-512x512.png";

export const ALL_INTERNAL_NAV_LINKS: InternalLinkItem[] = [
  { href: "/", label: "Home", description: "Main platform overview and tools" },
  {
    href: "/apps",
    label: "Apps",
    description: "Productivity, utility, and AI applications",
  },
  {
    href: "/apps/chatbot",
    label: "Chatbot",
    description: "AI chatbot and conversational assistants",
  },
  {
    href: "/apps/file-compressor",
    label: "File Compressor",
    description: "In-browser media and document compressor",
  },
  {
    href: "/apps/public-characters",
    label: "Public Characters",
    description: "Community-created AI characters and assets",
  },
  {
    href: "/apps/data-save",
    label: "Data Save",
    description: "Encrypted note and key-value storage",
  },
  {
    href: "/apps/qrcode-generator",
    label: "QR Code Generator",
    description: "Customizable QR code creator",
  },
  {
    href: "/apps/llm-agent",
    label: "LLM Agent",
    description: "Autonomous AI software engineering agent",
  },
  {
    href: "/apps/agent-search",
    label: "Agent Search",
    description: "Semantic web search for AI agents",
  },
  {
    href: "/apps/webdefender",
    label: "Web Defender",
    description: "API and website threat mitigation",
  },
  {
    href: "/apps/base64-encoder",
    label: "Base64 Encoder",
    description: "Encode and decode Base64 strings",
  },
  {
    href: "/apps/json-formatter",
    label: "JSON Formatter",
    description: "Format, validate, and beautify JSON",
  },
  {
    href: "/apps/vpn",
    label: "VPN",
    description: "Proxy and VPN configuration manager",
  },
  {
    href: "/games",
    label: "Games",
    description: "Classic single-player and multiplayer web games",
  },
  {
    href: "/games/chess",
    label: "Chess",
    description: "Play chess against AI",
  },
  {
    href: "/games/minesweeper",
    label: "Minesweeper",
    description: "Classic Minesweeper puzzle game",
  },
  {
    href: "/games/solitaire",
    label: "Solitaire",
    description: "Classic Solitaire card game",
  },
  {
    href: "/games/poker",
    label: "Texas Hold'em Poker",
    description: "Heads-up poker game",
  },
  {
    href: "/games/sudoku",
    label: "Sudoku",
    description: "Classic Sudoku number puzzle",
  },
  {
    href: "/games/wordsearch",
    label: "Word Search",
    description: "Find hidden words puzzle game",
  },
  {
    href: "/download",
    label: "Download",
    description: "Download desktop and Android apps",
  },
  {
    href: "/changelogs",
    label: "Changelogs",
    description: "Software release history and updates",
  },
  {
    href: "/auth",
    label: "Sign In / Register",
    description: "Sign in or register for an account",
  },
  {
    href: "/privacy",
    label: "Privacy Policy",
    description: "Data protection and privacy practices",
  },
  {
    href: "/terms",
    label: "Terms of Use",
    description: "Terms and conditions of service",
  },
  { href: "/eula", label: "EULA", description: "End User Licence Agreement" },
  {
    href: "/dmca",
    label: "DMCA Policy",
    description: "Copyright takedown and counter-notice policy",
  },
  {
    href: "/acceptable-use",
    label: "Acceptable Use",
    description: "Usage guidelines and security policies",
  },
  {
    href: "/legal",
    label: "Legal",
    description: "Legal index and regulatory documentation",
  },
  {
    href: "/license",
    label: "License",
    description: "Open-source MIT license notice",
  },
  {
    href: "/support",
    label: "Support",
    description: "User support and issue reporting",
  },
];

export const SEO_ROUTES: Record<string, RouteSeoData> = {
  "/": {
    path: "/",
    title: "Oxygen Low's Software - Modern Apps, Tools & Cloud Storage",
    description:
      "Oxygen Low's Software is a modern suite of web tools, AI utilities, privacy-focused applications, and encrypted cloud storage solutions.",
    canonicalPath: "/",
    h1: "Oxygen Low's Software",
    h2: [
      "Explore Web & Desktop Apps",
      "Privacy & Encrypted Storage",
      "AI Tools & Automation",
    ],
    keywords: [
      "software",
      "web apps",
      "ai tools",
      "cloud storage",
      "privacy",
      "file compressor",
      "chatbot",
      "web defender",
    ],
    ogType: "website",
    breadcrumbs: [{ name: "Home", url: "/" }],
    internalLinks: ALL_INTERNAL_NAV_LINKS.filter((l) => l.href !== "/"),
  },
  "/apps": {
    path: "/apps",
    title: "Apps & Tools - Oxygen Low's Software",
    description:
      "Explore our collection of web and desktop apps including AI chatbots, file compressor, QR code generator, data storage, and web security tools.",
    canonicalPath: "/apps",
    h1: "Apps & Tools",
    h2: [
      "Utility Tools",
      "AI & LLM Applications",
      "Security & Protection",
      "Developer Utilities",
    ],
    keywords: [
      "apps",
      "utilities",
      "developer tools",
      "ai tools",
      "chatbot",
      "file compressor",
      "qr code generator",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
    ],
    internalLinks: [
      {
        href: "/apps/chatbot",
        label: "Chatbot",
        description: "Chat with intelligent AI models",
      },
      {
        href: "/apps/file-compressor",
        label: "File Compressor",
        description: "Compress media and documents in browser",
      },
      {
        href: "/apps/public-characters",
        label: "Public Characters",
        description: "Share and use community AI characters",
      },
      {
        href: "/apps/data-save",
        label: "Data Save",
        description: "Client-side encrypted data storage",
      },
      {
        href: "/apps/qrcode-generator",
        label: "QR Code Generator",
        description: "Generate custom QR codes",
      },
      {
        href: "/apps/llm-agent",
        label: "LLM Agent",
        description: "Autonomous AI coding agent",
      },
      {
        href: "/apps/agent-search",
        label: "Agent Search",
        description: "Semantic search engine for AI agents",
      },
      {
        href: "/apps/webdefender",
        label: "Web Defender",
        description: "DDoS and bot protection suite",
      },
      {
        href: "/apps/base64-encoder",
        label: "Base64 Encoder",
        description: "Encode and decode Base64 data",
      },
      {
        href: "/apps/json-formatter",
        label: "JSON Formatter",
        description: "Format and inspect JSON payloads",
      },
      {
        href: "/apps/vpn",
        label: "VPN",
        description: "VPN and proxy traffic manager",
      },
    ],
  },
  "/apps/chatbot": {
    path: "/apps/chatbot",
    title: "AI Chatbot - Oxygen Low's Software",
    description:
      "Chat and brainstorm with intelligent multi-model AI assistants. Fast, private, and versatile artificial intelligence conversation platform.",
    canonicalPath: "/apps/chatbot",
    h1: "AI Chatbot Assistant",
    h2: [
      "Multi-Model AI Conversations",
      "Private & Secure Chats",
      "Custom Character Personas",
    ],
    keywords: [
      "ai chatbot",
      "chatbot online",
      "conversational ai",
      "multi-model ai",
      "chat assistant",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Chatbot", url: "/apps/chatbot" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/public-characters", label: "Public AI Characters" },
      { href: "/apps/llm-agent", label: "LLM Agent" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
    softwareType: "AI Chat Application",
  },
  "/apps/file-compressor": {
    path: "/apps/file-compressor",
    title: "File Compressor - Oxygen Low's Software",
    description:
      "Easily compress images, audio, video, and documents directly in your browser to save storage space and bandwidth with zero quality loss.",
    canonicalPath: "/apps/file-compressor",
    h1: "Online File Compressor",
    h2: [
      "Browser-Based Compression",
      "Image, Audio & Video Optimization",
      "Fast & Secure Processing",
    ],
    keywords: [
      "file compressor",
      "compress images",
      "compress video",
      "audio compression",
      "reduce file size",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "File Compressor", url: "/apps/file-compressor" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/data-save", label: "Data Save" },
      { href: "/apps/qrcode-generator", label: "QR Code Generator" },
    ],
    softwareType: "File Compression Utility",
  },
  "/apps/public-characters": {
    path: "/apps/public-characters",
    title: "Public Characters & Assets - Oxygen Low's Software",
    description:
      "Discover, download, and share community-created AI characters, custom prompts, creative universes, and digital assets.",
    canonicalPath: "/apps/public-characters",
    h1: "Public Characters & Assets",
    h2: [
      "Community AI Characters",
      "Custom Universes & Prompts",
      "Share Your Creations",
    ],
    keywords: [
      "ai characters",
      "custom personas",
      "prompt engineering",
      "public assets",
      "community characters",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Public Characters", url: "/apps/public-characters" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/chatbot", label: "AI Chatbot" },
      { href: "/terms", label: "Terms of Use" },
    ],
    softwareType: "Community Asset Directory",
  },
  "/apps/data-save": {
    path: "/apps/data-save",
    title: "Data Save - Oxygen Low's Software",
    description:
      "Securely store, organize, and manage encrypted data snippets, notes, and custom key-value pairs with client-side encryption.",
    canonicalPath: "/apps/data-save",
    h1: "Encrypted Data Save",
    h2: [
      "Zero-Knowledge Client Encryption",
      "Encrypted Note Storage",
      "Key-Value Snippet Manager",
    ],
    keywords: [
      "data storage",
      "encrypted notes",
      "secure snippet manager",
      "zero-knowledge encryption",
      "cloud data save",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Data Save", url: "/apps/data-save" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/file-compressor", label: "File Compressor" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
    softwareType: "Encrypted Storage Utility",
  },
  "/apps/qrcode-generator": {
    path: "/apps/qrcode-generator",
    title: "QR Code Generator - Oxygen Low's Software",
    description:
      "Create custom high-resolution QR codes for websites, text, Wi-Fi networks, and contact details with instant download options.",
    canonicalPath: "/apps/qrcode-generator",
    h1: "Custom QR Code Generator",
    h2: [
      "Instant QR Code Creation",
      "URL & Wi-Fi Formatting",
      "High Resolution Vector Download",
    ],
    keywords: [
      "qr code generator",
      "create qr code",
      "free qr code maker",
      "wifi qr code",
      "url qr code",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "QR Code Generator", url: "/apps/qrcode-generator" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/base64-encoder", label: "Base64 Encoder" },
      { href: "/apps/json-formatter", label: "JSON Formatter" },
    ],
    softwareType: "QR Code Creation Tool",
  },
  "/apps/llm-agent": {
    path: "/apps/llm-agent",
    title: "LLM Agent - Oxygen Low's Software",
    description:
      "Autonomous AI coding and development agent that reads, edits, executes, and builds complex software projects in your environment.",
    canonicalPath: "/apps/llm-agent",
    h1: "Autonomous AI Coding Agent",
    h2: [
      "Automated Codebase Refactoring",
      "Multi-Step Task Planning",
      "Secure Local & Cloud Execution",
    ],
    keywords: [
      "ai coding agent",
      "llm agent",
      "autonomous developer agent",
      "ai pair programming",
      "code automation",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "LLM Agent", url: "/apps/llm-agent" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/agent-search", label: "Agent Search" },
      { href: "/apps/chatbot", label: "AI Chatbot" },
    ],
    softwareType: "Autonomous AI Development Agent",
  },
  "/apps/agent-search": {
    path: "/apps/agent-search",
    title: "Agent Search - Oxygen Low's Software",
    description:
      "Intelligent semantic search and web discovery engine optimized for autonomous AI agents, research workflows, and users.",
    canonicalPath: "/apps/agent-search",
    h1: "Intelligent Agent Search",
    h2: [
      "Semantic Web Discovery",
      "Optimized for AI Agents",
      "Fast & Unbiased Results",
    ],
    keywords: [
      "agent search",
      "ai search engine",
      "semantic search",
      "web research tool",
      "autonomous search",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Agent Search", url: "/apps/agent-search" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/llm-agent", label: "LLM Agent" },
      { href: "/apps/chatbot", label: "AI Chatbot" },
    ],
    softwareType: "AI Search Engine",
  },
  "/apps/webdefender": {
    path: "/apps/webdefender",
    title: "Web Defender - Oxygen Low's Software",
    description:
      "Protect websites and APIs with intelligent DDoS protection, rate limiting, bot mitigation, IP filtering, and threat blocking.",
    canonicalPath: "/apps/webdefender",
    h1: "Web Defender Security Suite",
    h2: [
      "DDoS & Rate Limit Protection",
      "Threat Actor & Bot Blocking",
      "Easy Middleware Integration",
    ],
    keywords: [
      "web defender",
      "web security",
      "ddos protection",
      "rate limiting middleware",
      "bot mitigation",
      "firewall",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Web Defender", url: "/apps/webdefender" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/vpn", label: "VPN Manager" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
    ],
    softwareType: "Web Security & Firewall Middleware",
  },
  "/apps/base64-encoder": {
    path: "/apps/base64-encoder",
    title: "Base64 Encoder/Decoder - Oxygen Low's Software",
    description:
      "Easily encode and decode text, strings, and binary files with Base64 encoding tools directly in your browser.",
    canonicalPath: "/apps/base64-encoder",
    h1: "Base64 Encoder & Decoder",
    h2: [
      "Encode Text to Base64",
      "Decode Base64 Strings",
      "Instant In-Browser Conversion",
    ],
    keywords: [
      "base64 encoder",
      "base64 decoder",
      "base64 converter",
      "developer tools",
      "string encoder",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "Base64 Encoder", url: "/apps/base64-encoder" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/json-formatter", label: "JSON Formatter" },
      { href: "/apps/qrcode-generator", label: "QR Code Generator" },
    ],
    softwareType: "Encoding Utility",
  },
  "/apps/json-formatter": {
    path: "/apps/json-formatter",
    title: "JSON Formatter - Oxygen Low's Software",
    description:
      "Format, validate, beautify, and inspect JSON payloads with real-time syntax checking and structure visualization.",
    canonicalPath: "/apps/json-formatter",
    h1: "JSON Formatter & Validator",
    h2: [
      "Beautify & Minify JSON",
      "Syntax Error Validation",
      "Tree Structure Inspector",
    ],
    keywords: [
      "json formatter",
      "json beautifier",
      "json validator",
      "json parser",
      "developer utilities",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "JSON Formatter", url: "/apps/json-formatter" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/base64-encoder", label: "Base64 Encoder" },
      { href: "/apps/data-save", label: "Data Save" },
    ],
    softwareType: "JSON Utility",
  },
  "/apps/vpn": {
    path: "/apps/vpn",
    title: "VPN - Oxygen Low's Software",
    description:
      "Manage and monitor secure proxy and VPN network configurations with real-time bandwidth and traffic tracking.",
    canonicalPath: "/apps/vpn",
    h1: "VPN & Proxy Manager",
    h2: [
      "Encrypted Network Tunnel",
      "Bandwidth Tracking",
      "Secure Remote Proxying",
    ],
    keywords: [
      "vpn",
      "proxy",
      "secure tunnel",
      "privacy vpn",
      "network manager",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Apps", url: "/apps" },
      { name: "VPN", url: "/apps/vpn" },
    ],
    internalLinks: [
      { href: "/apps", label: "All Apps" },
      { href: "/apps/webdefender", label: "Web Defender" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
    softwareType: "VPN Utility",
  },
  "/games": {
    path: "/games",
    title: "Games - Oxygen Low's Software",
    description:
      "Play classic web games including Chess, Minesweeper, Solitaire, Sudoku, Poker, and Word Search directly in your browser.",
    canonicalPath: "/games",
    h1: "Classic Web Games",
    h2: [
      "Strategy & Board Games",
      "Card & Puzzle Games",
      "Singleplayer & Multiplayer",
    ],
    keywords: [
      "web games",
      "chess online",
      "minesweeper",
      "solitaire",
      "sudoku",
      "poker",
      "word search",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Games", url: "/games" },
    ],
    internalLinks: [
      { href: "/apps", label: "Apps & Tools" },
      { href: "/download", label: "Download Client" },
      { href: "/legal", label: "Legal" },
    ],
  },
  "/privacy": {
    path: "/privacy",
    title: "Privacy Policy - Oxygen Low's Software",
    description:
      "Learn how Oxygen Low's Software collects, protects, and manages your personal data in full compliance with UK GDPR, EU GDPR, and CCPA.",
    canonicalPath: "/privacy",
    h1: "Privacy Policy",
    h2: [
      "Information We Collect",
      "Data Protection & Rights",
      "Third-Party Processors & Safeguards",
    ],
    keywords: [
      "privacy policy",
      "data protection",
      "gdpr compliance",
      "ccpa",
      "oxygen low software privacy",
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Privacy Policy", url: "/privacy" },
    ],
    internalLinks: [
      { href: "/terms", label: "Terms of Use" },
      { href: "/legal", label: "Legal Index" },
      { href: "/eula", label: "EULA" },
      { href: "/acceptable-use", label: "Acceptable Use Policy" },
      { href: "/support", label: "Contact Support" },
    ],
  },
  "/terms": {
    path: "/terms",
    title: "Terms of Use - Oxygen Low's Software",
    description:
      "Read the Terms of Use and service rules governing your access to the Oxygen Low's Software web application, desktop client, and cloud services.",
    canonicalPath: "/terms",
    h1: "Terms of Use",
    h2: [
      "Acceptance of Terms",
      "Permitted Use & User Content",
      "Disclaimers & Liability",
    ],
    keywords: [
      "terms of use",
      "terms and conditions",
      "terms of service",
      "legal terms",
      "user agreement",
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Terms of Use", url: "/terms" },
    ],
    internalLinks: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/legal", label: "Legal Index" },
      { href: "/eula", label: "EULA" },
      { href: "/acceptable-use", label: "Acceptable Use Policy" },
      { href: "/dmca", label: "DMCA Policy" },
    ],
  },
  "/eula": {
    path: "/eula",
    title: "End User Licence Agreement - Oxygen Low's Software",
    description:
      "Review the End User Licence Agreement (EULA) defining software licence terms, permissions, intellectual property, and restrictions.",
    canonicalPath: "/eula",
    h1: "End User Licence Agreement",
    h2: [
      "Grant of Licence",
      "Licence Restrictions & Scope",
      "Intellectual Property Rights",
    ],
    keywords: [
      "eula",
      "end user licence agreement",
      "software licence",
      "software terms",
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
      { name: "EULA", url: "/eula" },
    ],
    internalLinks: [
      { href: "/terms", label: "Terms of Use" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/license", label: "Open Source License" },
      { href: "/legal", label: "Legal Index" },
    ],
  },
  "/dmca": {
    path: "/dmca",
    title: "DMCA & Copyright Policy - Oxygen Low's Software",
    description:
      "Review our DMCA and Copyright Policy on reporting copyright infringement, counter-notices, and repeat infringer procedures.",
    canonicalPath: "/dmca",
    h1: "DMCA & Copyright Policy",
    h2: [
      "Reporting Copyright Infringement",
      "Designated Copyright Agent",
      "Counter-Notice Procedure",
    ],
    keywords: [
      "dmca policy",
      "copyright policy",
      "takedown notice",
      "intellectual property infringement",
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
      { name: "DMCA Policy", url: "/dmca" },
    ],
    internalLinks: [
      { href: "/terms", label: "Terms of Use" },
      { href: "/acceptable-use", label: "Acceptable Use Policy" },
      { href: "/legal", label: "Legal Index" },
      { href: "/support", label: "Support" },
    ],
  },
  "/acceptable-use": {
    path: "/acceptable-use",
    title: "Acceptable Use Policy - Oxygen Low's Software",
    description:
      "Understand prohibited activities, security standards, and acceptable usage rules for all Oxygen Low's Software services and tools.",
    canonicalPath: "/acceptable-use",
    h1: "Acceptable Use Policy",
    h2: [
      "Prohibited Conduct & Abuse",
      "Security & AI Usage Standards",
      "Enforcement & Consequences",
    ],
    keywords: [
      "acceptable use policy",
      "aup",
      "prohibited activities",
      "platform rules",
      "security guidelines",
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
      { name: "Acceptable Use", url: "/acceptable-use" },
    ],
    internalLinks: [
      { href: "/terms", label: "Terms of Use" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/dmca", label: "DMCA Policy" },
      { href: "/legal", label: "Legal Index" },
    ],
  },
  "/legal": {
    path: "/legal",
    title: "Legal - Oxygen Low's Software",
    description:
      "Central directory of legal policies, terms of service, privacy practices, licensing, and compliance documentation for Oxygen Low's Software.",
    canonicalPath: "/legal",
    h1: "Legal Documentation & Policies",
    h2: [
      "Terms of Use",
      "Privacy & Data Protection",
      "Licensing & Acceptable Use",
    ],
    keywords: [
      "legal",
      "policies",
      "terms of service",
      "privacy policy",
      "eula",
      "dmca",
      "mit license",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
    ],
    internalLinks: [
      {
        href: "/terms",
        label: "Terms of Use",
        description: "Governing rules and conditions",
      },
      {
        href: "/privacy",
        label: "Privacy Policy",
        description: "Data collection and protection",
      },
      {
        href: "/eula",
        label: "EULA",
        description: "End user software licence agreement",
      },
      {
        href: "/dmca",
        label: "DMCA Policy",
        description: "Copyright takedowns and notices",
      },
      {
        href: "/acceptable-use",
        label: "Acceptable Use",
        description: "Prohibited conduct standards",
      },
      {
        href: "/license",
        label: "License",
        description: "Open-source MIT license",
      },
    ],
  },
  "/license": {
    path: "/license",
    title: "License - Oxygen Low's Software",
    description:
      "Open-source software license terms and MIT License notice for Oxygen Low's Software repository and libraries.",
    canonicalPath: "/license",
    h1: "Open Source License",
    h2: [
      "MIT License Terms",
      "Source Code Redistribution",
      "Third-Party Licences",
    ],
    keywords: [
      "license",
      "mit license",
      "open source software",
      "copyright notice",
    ],
    ogType: "article",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Legal", url: "/legal" },
      { name: "License", url: "/license" },
    ],
    internalLinks: [
      { href: "/legal", label: "Legal Index" },
      { href: "/terms", label: "Terms of Use" },
      { href: "/eula", label: "EULA" },
    ],
  },
  "/download": {
    path: "/download",
    title: "Download - Oxygen Low's Software",
    description:
      "Download official desktop and Android application installers for Oxygen Low's Software for fast, local access.",
    canonicalPath: "/download",
    h1: "Download Applications",
    h2: [
      "Windows Desktop Client",
      "Android Application",
      "System Requirements",
    ],
    keywords: [
      "download software",
      "desktop app",
      "android apk",
      "download client",
      "install software",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Download", url: "/download" },
    ],
    internalLinks: [
      { href: "/apps", label: "Web Apps" },
      { href: "/changelogs", label: "Release Notes" },
      { href: "/support", label: "Support" },
    ],
  },
  "/changelogs": {
    path: "/changelogs",
    title: "Changelogs - Oxygen Low's Software",
    description:
      "Stay up to date with new features, updates, improvements, and releases across Oxygen Low's Software.",
    canonicalPath: "/changelogs",
    h1: "Changelogs & Release Notes",
    h2: ["Latest Updates", "Feature Additions", "Performance & Bug Fixes"],
    keywords: [
      "changelogs",
      "release notes",
      "software updates",
      "version history",
      "patch notes",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Changelogs", url: "/changelogs" },
    ],
    internalLinks: [
      { href: "/apps", label: "Apps" },
      { href: "/download", label: "Download App" },
      { href: "/support", label: "Support" },
    ],
  },
  "/support": {
    path: "/support",
    title: "Support - Oxygen Low's Software",
    description:
      "Get help, submit support tickets, report issues, and access platform documentation for Oxygen Low's Software.",
    canonicalPath: "/support",
    h1: "Support & Help Center",
    h2: [
      "Submit Support Ticket",
      "Account & Technical Assistance",
      "Frequently Asked Questions",
    ],
    keywords: [
      "support",
      "help center",
      "support ticket",
      "customer service",
      "troubleshooting",
    ],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Support", url: "/support" },
    ],
    internalLinks: [
      { href: "/legal", label: "Legal Documentation" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
    ],
  },
  "/auth": {
    path: "/auth",
    title: "Sign In / Register - Oxygen Low's Software",
    description:
      "Sign in or create an account on Oxygen Low's Software to access encrypted cloud storage, customizable tools, and apps.",
    canonicalPath: "/auth",
    h1: "Account Sign In & Registration",
    h2: ["Sign In", "Create Account", "Secure Authentication"],
    keywords: ["login", "sign in", "create account", "register", "auth"],
    ogType: "website",
    breadcrumbs: [
      { name: "Home", url: "/" },
      { name: "Sign In", url: "/auth" },
    ],
    internalLinks: [
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Use" },
      { href: "/apps", label: "Apps" },
    ],
  },
};

/**
 * Resolves SEO metadata for a given path, handling exact routes, dynamic routes, and aliases.
 */
export function getSeoMetadata(pathname: string): RouteSeoData {
  const cleanPath = (pathname.split("?")[0] || "/").replace(/\/+$/, "") || "/";

  // Check exact match
  if (SEO_ROUTES[cleanPath]) {
    return SEO_ROUTES[cleanPath];
  }

  // Handle aliases
  if (
    cleanPath === "/webdefender" ||
    cleanPath === "/defender" ||
    cleanPath === "/apps/defender"
  ) {
    return SEO_ROUTES["/apps/webdefender"];
  }
  if (cleanPath === "/apps/public-assets") {
    return SEO_ROUTES["/apps/public-characters"];
  }

  // Handle /apps/:appId
  if (cleanPath.startsWith("/apps/")) {
    const appId = cleanPath.slice("/apps/".length);
    const readableName = appId
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return {
      path: cleanPath,
      title: `${readableName} - Oxygen Low's Software`,
      description: `Use ${readableName} on Oxygen Low's Software. Fast, secure, and modern productivity and utility tools built for web and desktop.`,
      canonicalPath: cleanPath,
      h1: readableName,
      h2: ["Application Features", "Usage & Tools"],
      keywords: [appId, "web app", "utility", "tools", "oxygen low software"],
      ogType: "website",
      breadcrumbs: [
        { name: "Home", url: "/" },
        { name: "Apps", url: "/apps" },
        { name: readableName, url: cleanPath },
      ],
      internalLinks: [
        { href: "/apps", label: "All Apps" },
        { href: "/", label: "Home" },
      ],
    };
  }

  // Handle /games/:gameId
  if (cleanPath.startsWith("/games/")) {
    const gameId = cleanPath.slice("/games/".length);
    const readableName = gameId
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

    return {
      path: cleanPath,
      title: `${readableName} - Games - Oxygen Low's Software`,
      description: `Play ${readableName} online for free directly in your browser on Oxygen Low's Software. Fast, responsive, and fun web games.`,
      canonicalPath: cleanPath,
      h1: readableName,
      h2: ["Play Game", "Rules & Instructions"],
      keywords: [
        gameId,
        "online game",
        "web game",
        "free game",
        "oxygen low software",
      ],
      ogType: "website",
      breadcrumbs: [
        { name: "Home", url: "/" },
        { name: "Games", url: "/games" },
        { name: readableName, url: cleanPath },
      ],
      internalLinks: [
        { href: "/games", label: "All Games" },
        { href: "/apps", label: "Apps" },
      ],
    };
  }

  // Fallback for unrecognized routes
  return {
    path: cleanPath,
    title: "Oxygen Low's Software",
    description:
      "Oxygen Low's Software - Modern web applications, tools, and encrypted cloud storage.",
    canonicalPath: cleanPath,
    h1: "Oxygen Low's Software",
    h2: ["Explore Platform Features", "Apps & Tools"],
    keywords: ["software", "web apps", "cloud storage", "privacy"],
    ogType: "website",
    breadcrumbs: [{ name: "Home", url: "/" }],
    internalLinks: ALL_INTERNAL_NAV_LINKS,
  };
}

/**
 * Builds Schema.org JSON-LD structured data for the route.
 */
export function generateJsonLd(
  metadata: RouteSeoData,
  baseUrl = DEFAULT_BASE_URL,
): Record<string, any>[] {
  const canonicalUrl = `${baseUrl}${metadata.canonicalPath === "/" ? "" : metadata.canonicalPath}`;

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: baseUrl,
    description:
      "A modern platform for apps, AI utilities, and encrypted cloud storage.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseUrl}/apps/agent-search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: baseUrl,
    logo: `${baseUrl}/icons/icon-512x512.png`,
    sameAs: ["https://github.com/Oxygen-Low"],
  };

  const webPageSchema: Record<string, any> = {
    "@context": "https://schema.org",
    "@type": metadata.ogType === "article" ? "TechArticle" : "WebPage",
    name: metadata.title,
    headline: metadata.h1,
    description: metadata.description,
    url: canonicalUrl,
    isPartOf: {
      "@type": "WebSite",
      name: SITE_NAME,
      url: baseUrl,
    },
  };

  if (metadata.breadcrumbs && metadata.breadcrumbs.length > 0) {
    webPageSchema.breadcrumb = {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: metadata.breadcrumbs.map((b, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: b.name,
        item: `${baseUrl}${b.url}`,
      })),
    };
  }

  const schemas: Record<string, any>[] = [
    websiteSchema,
    organizationSchema,
    webPageSchema,
  ];

  if (metadata.softwareType) {
    schemas.push({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: metadata.h1,
      operatingSystem: "Web, Windows, Android",
      applicationCategory: metadata.softwareType,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      url: canonicalUrl,
    });
  }

  return schemas;
}

/**
 * Injects dynamic, route-specific SEO tags into the base HTML template.
 */
export function injectSeoTags(
  html: string,
  pathname: string,
  baseUrl = DEFAULT_BASE_URL,
): string {
  const metadata = getSeoMetadata(pathname);
  const canonicalUrl = `${baseUrl}${metadata.canonicalPath === "/" ? "" : metadata.canonicalPath}`;
  const jsonLdSchemas = generateJsonLd(metadata, baseUrl);

  let modifiedHtml = html;

  // 1. Update <title>
  if (/<title>.*?<\/title>/i.test(modifiedHtml)) {
    modifiedHtml = modifiedHtml.replace(
      /<title>.*?<\/title>/i,
      `<title>${escapeHtml(metadata.title)}</title>`,
    );
  } else {
    modifiedHtml = modifiedHtml.replace(
      /<head>/i,
      `<head>\n    <title>${escapeHtml(metadata.title)}</title>`,
    );
  }

  // 2. Replace or inject meta description
  const metaDescTag = `<meta name="description" content="${escapeHtml(metadata.description)}" />`;
  if (/<meta\s+name=["']description["'][^>]*>/i.test(modifiedHtml)) {
    modifiedHtml = modifiedHtml.replace(
      /<meta\s+name=["']description["'][^>]*>/i,
      metaDescTag,
    );
  } else {
    modifiedHtml = modifiedHtml.replace(
      /<title>.*?<\/title>/i,
      (m) => `${m}\n    ${metaDescTag}`,
    );
  }

  // 3. Inject or replace canonical link tag
  const canonicalTag = `<link rel="canonical" href="${canonicalUrl}" />`;
  if (/<link\s+rel=["']canonical["'][^>]*>/i.test(modifiedHtml)) {
    modifiedHtml = modifiedHtml.replace(
      /<link\s+rel=["']canonical["'][^>]*>/i,
      canonicalTag,
    );
  } else {
    modifiedHtml = modifiedHtml.replace(
      /<meta\s+name=["']description["'][^>]*>/i,
      (m) => `${m}\n    ${canonicalTag}`,
    );
  }

  // 4. Build Open Graph & Twitter meta tags
  const ogTags = [
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:type" content="${metadata.ogType || "website"}" />`,
    `<meta property="og:image" content="${DEFAULT_OG_IMAGE}" />`,
    `<meta property="og:locale" content="en_US" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(metadata.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`,
    `<meta name="twitter:image" content="${DEFAULT_OG_IMAGE}" />`,
  ];

  if (metadata.keywords && metadata.keywords.length > 0) {
    ogTags.push(
      `<meta name="keywords" content="${escapeHtml(metadata.keywords.join(", "))}" />`,
    );
  }

  // Remove existing static OG/Twitter tags if present to avoid duplication
  modifiedHtml = modifiedHtml
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi, "")
    .replace(/<meta\s+name=["']keywords["'][^>]*>\s*/gi, "")
    .replace(
      /<script\s+type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi,
      "",
    );

  // Inject OG, Twitter & JSON-LD scripts right after canonical tag
  const jsonLdScripts = jsonLdSchemas
    .map(
      (schema) =>
        `    <script type="application/ld+json">\n${JSON.stringify(schema, null, 2)}\n    </script>`,
    )
    .join("\n");

  const seoBlock = `\n    ${ogTags.join("\n    ")}\n${jsonLdScripts}`;
  modifiedHtml = modifiedHtml.replace(
    new RegExp(
      `<link\\s+rel=["']canonical["']\\s+href=["']${escapeRegex(canonicalUrl)}["']\\s*\\/?>`,
      "i",
    ),
    (m) => `${m}${seoBlock}`,
  );

  // 5. Inject crawler-friendly semantic HTML into #root fallback
  // Provide accessible semantic H1, description, and internal links for search crawlers
  const linksHtml = (metadata.internalLinks || ALL_INTERNAL_NAV_LINKS)
    .map(
      (l) =>
        `<li><a href="${l.href}">${escapeHtml(l.label)}</a>${l.description ? ` - ${escapeHtml(l.description)}` : ""}</li>`,
    )
    .join("\n        ");

  const fallbackContent = `<div class="initial-loader">
        <div class="initial-spinner"></div>
      </div>
      <header class="sr-only">
        <h1>${escapeHtml(metadata.h1)}</h1>
        <p>${escapeHtml(metadata.description)}</p>
      </header>
      <nav aria-label="Site Navigation" class="sr-only">
        <ul>
        ${linksHtml}
        </ul>
      </nav>`;

  modifiedHtml = modifiedHtml.replace(
    /<div id="root">[\s\S]*?<\/div>\s*<script/i,
    `<div id="root">\n      ${fallbackContent}\n    </div>\n\n    <script`,
  );

  return modifiedHtml;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
