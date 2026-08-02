import type { Messages } from './en';

/**
 * The Arabic half, held to the English shape by the type. Proper nouns —
 * Whisper, Hugging Face, GitHub, the model names, and the app itself — stay
 * Latin: that is how Arabic software writes them, and transliterating a brand
 * helps nobody find it.
 */
export const ar: Messages = {
	appName: 'Transcribe',

	nav: {
		transcribe: 'التفريغ',
		history: 'السجل',
		settings: 'الإعدادات',
		toggleTheme: 'تبديل الوضع الداكن'
	},

	update: {
		available: (version: string) => `الإصدار ${version} متوفر الآن`,
		body: 'إصدار جديد جاهز للتنزيل.',
		get: 'تنزيل التحديث',
		dismiss: 'ليس الآن'
	},

	home: {
		title: 'فرِّغ ملف فيديو أو صوت',
		subtitle: 'يعمل محليًا باستخدام Whisper — لا شيء يغادر جهازك.',
		dropFine: 'أسقط ملف فيديو أو صوت هنا، أو انقر للاختيار',
		clickToChoose: 'انقر لاختيار ملف فيديو أو صوت',
		tapToChoose: 'المس لاختيار ملف فيديو أو صوت',
		removeFile: 'إزالة الملف',
		spokenLanguage: 'لغة الكلام',
		spokenLanguageSummary: (language: string) => `لغة الكلام — ${language}`,
		transcribe: 'فرِّغ',
		transcribeAnother: 'فرِّغ ملفًا آخر',
		cancel: 'إلغاء',
		downloadingModel: (model: string) => `جارٍ تنزيل ${model}`,
		downloadDetail: (received: string, total: string) =>
			`${received} من ${total} — مرة واحدة لكل نموذج؛ يُفتح التفريغ عند اكتماله.`,
		downloadFailed: 'فشل تنزيل النموذج',
		retrying: (message: string) => `${message} — تجري إعادة المحاولة تلقائيًا.`,
		failed: 'فشل التفريغ',
		complete: 'اكتمل التفريغ'
	},

	settings: {
		title: 'الإعدادات',
		windowTitle: 'الإعدادات — Transcribe',
		transcription: 'التفريغ',
		checkingModel: 'جارٍ التحقق من النموذج المثبَّت…',
		downloadDetail: (received: string, total: string) =>
			`${received} من ${total} — مرة واحدة لكل نموذج. يمكنك مغادرة هذه الشاشة؛ سيستمر التنزيل.`,
		modelUnavailable: 'النموذج غير متوفر',
		unknownError: 'خطأ غير معروف',
		engineUnreachable: 'تعذّر الوصول إلى المحرك',
		transcribingWith: (model: string) => `سيجري التفريغ باستخدام ${model}`,

		spokenLanguage: 'لغة الكلام الافتراضية',
		spokenLanguageLabel: 'لغة الصوت',
		spokenLanguageHelp:
			'اللغة التي يبدأ منها كل تفريغ. الاكتشاف التلقائي صحيح في الغالب — عيِّن هذا فقط إذا كنت تعمل غالبًا بلغة واحدة. ولا يزال بإمكانك تغييرها لكل ملف قبل التفريغ.',

		appLanguage: 'لغة التطبيق',
		appLanguageEnglish: 'English',
		appLanguageArabic: 'العربية',
		appLanguageSystem: 'النظام',
		appLanguageHelp: 'خيار «النظام» يتبع لغة الجهاز، ويعرض العربية عندما يستخدمها الجهاز.',

		appearance: 'المظهر',
		light: 'فاتح',
		dark: 'داكن',
		system: 'النظام',
		appearanceHelp: 'خيار «النظام» يتبع الجهاز، ويستمر في متابعته إذا تغيّر أثناء فتح التطبيق.',

		developer: 'المطوّر',
		developerHelp:
			'يعرض السجل ما قام به المحرّك — التنزيلات والتفريغات وأي أخطاء — ولا يغادر هذا الجهاز أبدًا. إذا فشل شيء، فالسبب مدوَّن هناك.',
		viewLogs: 'عرض السجل التقني',

		about: 'حول',
		description: 'تفريغ الفيديو والصوت على الجهاز، مدعوم بـ whisper.cpp.',
		privacy:
			'الصوت والنصوص لا تغادر هذا الجهاز أبدًا. لا يجلب Transcribe سوى نموذج Whisper من Hugging Face، ويسأل GitHub عمّا إذا كان هناك إصدار أحدث.',
		viewOnGitHub: 'عرض على GitHub',
		reportIssue: 'الإبلاغ عن مشكلة',
		license: (license: string) => `مرخَّص بموجب ${license}. التفريغ بواسطة`
	},

	models: {
		summary: (label: string, size: string) => `نموذج التفريغ — ${label} (${size})`,
		intro:
			'النماذج الأكبر تسمع أفضل وتستغرق وقتًا أطول. الاقتراح أدناه مجرد نقطة بداية — كل نموذج متاح على كل جهاز، فإذا أردت الأدق على الهاتف فخذه.',
		suggestedPhone: 'مقترح للهواتف',
		suggestedDesktop: 'مقترح لسطح المكتب',
		downloaded: 'منزَّل',
		cantTranslate: 'لا يترجم',
		footnote:
			'التبديل إلى نموذج جديد ينزّله عند أول استخدام. ويبقى القديم على القرص، لذا فالعودة إليه فورية.',
		blurbs: {
			tiny: 'الأسرع والأقل دقة — يُسقط كلمات ويشوّه الأسماء، خصوصًا مع لهجة أو ضجيج في الخلفية. يستحق على هاتف قديم، أو كمسودة أولى.',
			base: 'لا يزال سريعًا جدًا وبالكاد أكبر حجمًا. موثوق مع كلام واضح في غرفة هادئة؛ ويبدأ بالتعثر مع الموسيقى أو تداخل الأصوات.',
			small:
				'الخيار الأمثل على الهاتف: دقيق بما يكفي لنصوص حقيقية، وصغير بما يكفي ليُحمَّل دون مشاكل، وينهي عمله دون استنزاف البطارية.',
			medium:
				'أفضل بوضوح من Small مع الصوت الصعب. جيد على الحاسوب المحمول؛ وعلى الهاتف توقَّع انتظارًا يبلغ أضعاف مدة التسجيل.',
			'large-v3-turbo':
				'قريب من دقة Large في جزء من الوقت — أفضل خيار افتراضي على سطح المكتب. العيب الوحيد: لا يستطيع الترجمة، فالترجمة تجلب نموذجًا ثانيًا.',
			'large-v3':
				'الخيار الأدق، ويترجم دون تنزيل ثانٍ. زمن تشغيله ضعف Turbo تقريبًا، وحمل ثقيل على الهاتف — لكن لا شيء يمنعك من اختياره.'
		} as Record<string, string>
	},

	history: {
		title: 'السجل',
		windowTitle: 'السجل — Transcribe',
		clear: 'مسح السجل',
		empty: 'لا نصوص بعد',
		emptyHelp: 'كل ما تفرِّغه يُحفظ هنا، على هذا الجهاز.',
		transcribeAFile: 'فرِّغ ملفًا',
		clearConfirm: 'مسح كل السجل؟',
		clearConfirmHelp: 'سيُحذف كل نص محفوظ على هذا الجهاز. لا يمكن التراجع عن هذا.',
		cancel: 'إلغاء',
		clearAction: 'مسح',
		cleared: 'تم مسح السجل',

		notFound: 'النص غير موجود',
		notFoundHelp: 'ربما حُذف أو حُفظ في متصفح آخر.',
		back: 'العودة إلى السجل',
		noPlayback:
			'التشغيل غير متاح — يُحتفظ بالصوت لساعات قليلة فقط بعد التفريغ. ولا يزال النص قابلًا للتحرير بالكامل.',
		deleteTranscript: 'حذف النص',
		deleteConfirm: 'حذف هذا النص؟',
		deleteConfirmHelp: 'لا يمكن التراجع عن هذا.',
		deleteAction: 'حذف',
		deleted: 'تم حذف النص'
	},

	transcript: {
		heading: 'النص',
		edit: 'تحرير',
		done: 'تم',
		copy: 'نسخ',
		copied: 'نُسخ إلى الحافظة',
		editingHint: 'تُحفظ التعديلات أثناء الكتابة، وتغذّي أزرار النسخ والتنزيل أعلاه.',
		english: 'الإنجليزية',
		translate: 'ترجمة إلى الإنجليزية',
		translated: 'تُرجم إلى الإنجليزية',
		translateNote: (model: string, size: string) =>
			`أول ترجمة تنزّل ${model} (${size}) — النموذج المحدد للتفريغ لا يترجم. اختيار نموذج يترجم، ضمن «نموذج التفريغ»، يجنّبك التنزيل الثاني.`,
		translationFailed: 'فشلت الترجمة',
		cancel: 'إلغاء',
		jumpTo: (time: string) => `الانتقال إلى ${time}`,
		editAria: (time: string) => `النص عند ${time}`
	},

	logs: {
		title: 'السجل التقني',
		windowTitle: 'السجل التقني — Transcribe',
		back: 'العودة إلى الإعدادات',
		empty: 'لا شيء مسجَّل بعد',
		emptyHelp: 'فرِّغ ملفًا أو نزِّل نموذجًا، وستظهر كل خطوة هنا.',
		copy: 'نسخ',
		copied: 'نُسخ السجل إلى الحافظة',
		clear: 'مسح',
		cleared: 'مُسح السجل',
		webNote:
			'في المتصفح تُلتقط أخطاء هذه الصفحة فقط — أما المحرّك فيسجّل في طرفية الخادم.'
	},

	run: {
		preparing: 'تحضير الصوت',
		transcribing: 'جارٍ التفريغ',
		downloading: 'تنزيل نموذج الترجمة',
		translating: 'الترجمة إلى الإنجليزية',
		estimating: 'جارٍ تقدير الوقت…',
		stoppedEarly: 'توقف التشغيل قبل اكتماله.'
	},

	eta: {
		seconds: 'ثوانٍ قليلة متبقية',
		aboutSeconds: (s: number) => `نحو ${s} ثانية متبقية`,
		aboutMinutes: (m: number) => `نحو ${m} دقيقة متبقية`,
		aboutHours: (h: number, m: number) => `نحو ${h} س ${m} د متبقية`
	},

	progress: {
		preparing: [
			'قراءة الملف…',
			'البحث عن المسار الصوتي…',
			'فك الترميز إلى 16 كيلوهرتز أحادي…',
			'Whisper لا يسمع إلا صوتًا أحاديًا — يجري دمج القنوات…',
			'أوشكنا على البدء…'
		],
		transcribing: [
			'نستمع…',
			'نعمل على الصوت…',
			'نلتقط الكلمات…',
			'نضبط التوقيتات…',
			'ما زلنا نعمل — الملفات الطويلة تستغرق وقتًا…',
			'نرتّب الكلمات في أسطر…',
			'لا يُرفع أي شيء؛ كل هذا يعمل هنا…'
		],
		downloading: [
			'جلب النموذج…',
			'يحدث هذا مرة واحدة لكل نموذج…',
			'ملفات كبيرة، لمرة واحدة فقط…',
			'التنزيل من Hugging Face…',
			'يستأنف إذا انقطع الاتصال…'
		],
		translating: [
			'الترجمة إلى الإنجليزية…',
			'قراءة الصوت مجددًا، بالإنجليزية هذه المرة…',
			'مطابقة الترجمة مع التوقيتات…',
			'ما زلنا نعمل — تستغرق الترجمة قرابة ما استغرقه التفريغ…'
		]
	},

	autoDetect: 'اكتشاف تلقائي'
};
