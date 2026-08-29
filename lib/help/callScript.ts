import type { Warning } from '@/lib/domain/warning'
import {
  hasNeed,
  packLanguage,
  type PackLanguage,
  type UserProfile,
} from '@/lib/domain/profile'
import { getPack, LANGUAGE_NAMES, LANGUAGE_IN_ENGLISH } from '@/lib/i18n'

export type HelpNeed = 'evacuate' | 'information' | 'check-on-me'

export interface CallScript {
  /** Read aloud to the operator, or show them the screen. */
  english: string[]
  /** The same sentences, so the caller knows what they are saying. */
  translated: string[]
}

type LineKey =
  | 'needEvacuate'
  | 'needInformation'
  | 'needCheckOnMe'
  | 'atPlace'
  | 'placeUnknown'
  | 'fireNear'
  | 'needInterpreter'
  | 'needMobility'
  | 'needLowVision'
  | 'needHearing'
  | 'needCognitive'
  | 'needSimpler'
  | 'transportPublic'
  | 'transportTaxi'
  | 'transportAccessible'
  | 'transportAssistance'
  | 'transportUnsure'

const LEVEL_LABEL: Record<string, string> = {
  'emergency-warning': 'Emergency Warning',
  'watch-and-act': 'Watch and Act',
  advice: 'Advice',
  'planned-burn': 'Planned Burn',
  'not-applicable': 'incident',
}

const LINES: Record<PackLanguage, Record<LineKey, string>> = {
  en: {
    needEvacuate: 'Hello. I need help to leave my home because of a bush fire.',
    needInformation: 'Hello. I need information about a bush fire near me.',
    needCheckOnMe: 'Hello. I am not able to leave and I need someone to check on me.',
    atPlace: 'I am at {place}.',
    placeUnknown: 'I am in New South Wales. I can give you my address.',
    fireNear: 'There is a bush fire near me. The official warning is {level}.',
    needInterpreter: 'I speak {language}. Please connect me to an interpreter.',
    needMobility: 'I need help to move around.',
    needLowVision: 'I have low vision.',
    needHearing: 'I have difficulty hearing. Please speak clearly.',
    needCognitive: 'Please speak slowly and explain things simply.',
    needSimpler: 'Please use simple words.',
    transportPublic: 'I do not have a car. I use public transport.',
    transportTaxi: 'I do not have a car. I would need a taxi.',
    transportAccessible: 'I need accessible transport.',
    transportAssistance: 'I need someone to help me leave.',
    transportUnsure: 'I am not sure how I would leave.',
  },
  zh: {
    needEvacuate: '您好。因为丛林火灾，我需要帮助离开家。',
    needInformation: '您好。我想了解我附近丛林火灾的情况。',
    needCheckOnMe: '您好。我无法离开，需要有人来看看我。',
    atPlace: '我在{place}。',
    placeUnknown: '我在新南威尔士州。我可以告诉您我的地址。',
    fireNear: '我附近有丛林火灾。官方警报级别是{level}。',
    needInterpreter: '我说{language}。请为我接通口译员。',
    needMobility: '我行动需要帮助。',
    needLowVision: '我视力不好。',
    needHearing: '我听力有困难。请讲清楚一些。',
    needCognitive: '请慢一点讲，并简单解释。',
    needSimpler: '请用简单的词语。',
    transportPublic: '我没有车。我乘坐公共交通。',
    transportTaxi: '我没有车。我需要叫出租车。',
    transportAccessible: '我需要无障碍交通工具。',
    transportAssistance: '我需要有人帮助我离开。',
    transportUnsure: '我不确定我要怎么离开。',
  },
  ne: {
    needEvacuate: 'नमस्ते। वन डढेलोका कारण मलाई घर छोड्न सहयोग चाहियो।',
    needInformation: 'नमस्ते। मलाई नजिकैको वन डढेलोबारे जानकारी चाहियो।',
    needCheckOnMe: 'नमस्ते। म निस्कन सक्दिनँ, कसैले मलाई हेर्न आइदिनुपर्‍यो।',
    atPlace: 'म {place} मा छु।',
    placeUnknown: 'म न्यु साउथ वेल्समा छु। म तपाईंलाई मेरो ठेगाना भन्न सक्छु।',
    fireNear: 'मेरो नजिक वन डढेलो छ। आधिकारिक चेतावनी {level} हो।',
    needInterpreter: 'म {language} बोल्छु। कृपया मलाई दोभाषेसँग जोडिदिनुहोस्।',
    needMobility: 'मलाई हिँडडुल गर्न सहयोग चाहिन्छ।',
    needLowVision: 'मलाई कम देखिन्छ।',
    needHearing: 'मलाई सुन्न गाह्रो हुन्छ। कृपया प्रस्ट बोल्नुहोस्।',
    needCognitive: 'कृपया बिस्तारै र सरल तरिकाले बुझाउनुहोस्।',
    needSimpler: 'कृपया सरल शब्द प्रयोग गर्नुहोस्।',
    transportPublic: 'मसँग कार छैन। म सार्वजनिक यातायात प्रयोग गर्छु।',
    transportTaxi: 'मसँग कार छैन। मलाई ट्याक्सी चाहिन्छ।',
    transportAccessible: 'मलाई पहुँचयोग्य यातायात चाहिन्छ।',
    transportAssistance: 'मलाई निस्कन कसैको सहयोग चाहिन्छ।',
    transportUnsure: 'म कसरी निस्कने भन्ने कुरामा अनिश्चित छु।',
  },
  hi: {
    needEvacuate: 'नमस्ते। जंगल की आग के कारण मुझे अपना घर छोड़ने में मदद चाहिए।',
    needInformation: 'नमस्ते। मुझे अपने पास की जंगल की आग के बारे में जानकारी चाहिए।',
    needCheckOnMe: 'नमस्ते। मैं जा नहीं सकता/सकती, कोई मुझे देखने आ जाए।',
    atPlace: 'मैं {place} में हूँ।',
    placeUnknown: 'मैं न्यू साउथ वेल्स में हूँ। मैं आपको अपना पता बता सकता/सकती हूँ।',
    fireNear: 'मेरे पास जंगल की आग है। आधिकारिक चेतावनी {level} है।',
    needInterpreter: 'मैं {language} बोलता/बोलती हूँ। कृपया मुझे दुभाषिये से जोड़ें।',
    needMobility: 'मुझे चलने-फिरने में मदद चाहिए।',
    needLowVision: 'मुझे कम दिखाई देता है।',
    needHearing: 'मुझे सुनने में कठिनाई है। कृपया साफ़ बोलें।',
    needCognitive: 'कृपया धीरे और आसान भाषा में समझाएँ।',
    needSimpler: 'कृपया आसान शब्दों का प्रयोग करें।',
    transportPublic: 'मेरे पास गाड़ी नहीं है। मैं सार्वजनिक परिवहन लेता/लेती हूँ।',
    transportTaxi: 'मेरे पास गाड़ी नहीं है। मुझे टैक्सी चाहिए होगी।',
    transportAccessible: 'मुझे सुलभ परिवहन चाहिए।',
    transportAssistance: 'मुझे निकलने के लिए किसी की मदद चाहिए।',
    transportUnsure: 'मुझे नहीं पता कि मैं कैसे निकलूँगा/निकलूँगी।',
  },
  ar: {
    needEvacuate: 'مرحباً. أحتاج مساعدة لمغادرة منزلي بسبب حريق أحراش.',
    needInformation: 'مرحباً. أحتاج معلومات عن حريق أحراش قريب مني.',
    needCheckOnMe: 'مرحباً. لا أستطيع المغادرة وأحتاج من يطمئن عليّ.',
    atPlace: 'أنا في {place}.',
    placeUnknown: 'أنا في نيو ساوث ويلز. يمكنني إعطاؤك عنواني.',
    fireNear: 'هناك حريق أحراش قريب مني. التحذير الرسمي هو {level}.',
    needInterpreter: 'أتحدث {language}. من فضلك صِلني بمترجم فوري.',
    needMobility: 'أحتاج مساعدة في التنقّل.',
    needLowVision: 'لديّ ضعف في البصر.',
    needHearing: 'لديّ صعوبة في السمع. من فضلك تحدّث بوضوح.',
    needCognitive: 'من فضلك تحدّث ببطء واشرح بطريقة بسيطة.',
    needSimpler: 'من فضلك استخدم كلمات بسيطة.',
    transportPublic: 'ليس لديّ سيارة. أستخدم المواصلات العامة.',
    transportTaxi: 'ليس لديّ سيارة. سأحتاج سيارة أجرة.',
    transportAccessible: 'أحتاج وسيلة نقل مُهيّأة لذوي الإعاقة.',
    transportAssistance: 'أحتاج شخصاً يساعدني على المغادرة.',
    transportUnsure: 'لست متأكداً كيف سأغادر.',
  },
  vi: {
    needEvacuate: 'Xin chào. Tôi cần giúp đỡ để rời khỏi nhà vì cháy rừng.',
    needInformation: 'Xin chào. Tôi cần thông tin về đám cháy rừng gần nhà tôi.',
    needCheckOnMe: 'Xin chào. Tôi không thể rời đi và cần ai đó đến xem tôi thế nào.',
    atPlace: 'Tôi đang ở {place}.',
    placeUnknown: 'Tôi đang ở New South Wales. Tôi có thể cho bạn địa chỉ của tôi.',
    fireNear: 'Có cháy rừng gần tôi. Mức cảnh báo chính thức là {level}.',
    needInterpreter: 'Tôi nói tiếng {language}. Xin hãy nối máy cho tôi với thông dịch viên.',
    needMobility: 'Tôi cần giúp đỡ để di chuyển.',
    needLowVision: 'Tôi nhìn kém.',
    needHearing: 'Tôi nghe khó. Xin hãy nói rõ.',
    needCognitive: 'Xin hãy nói chậm và giải thích đơn giản.',
    needSimpler: 'Xin hãy dùng từ đơn giản.',
    transportPublic: 'Tôi không có xe hơi. Tôi đi phương tiện công cộng.',
    transportTaxi: 'Tôi không có xe hơi. Tôi sẽ cần taxi.',
    transportAccessible: 'Tôi cần phương tiện dành cho người khuyết tật.',
    transportAssistance: 'Tôi cần người giúp tôi rời đi.',
    transportUnsure: 'Tôi không chắc mình sẽ rời đi bằng cách nào.',
  },
}

const TRANSPORT_LINE: Partial<Record<UserProfile['transport'], LineKey>> = {
  'public-transport': 'transportPublic',
  'taxi-rideshare': 'transportTaxi',
  'accessible-transport': 'transportAccessible',
  'needs-assistance': 'transportAssistance',
  unsure: 'transportUnsure',
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
}

export function buildCallScript(
  profile: UserProfile,
  warning: Warning | null,
  need: HelpNeed,
): CallScript {
  const keys: LineKey[] = []

  if (need === 'evacuate') keys.push('needEvacuate')
  else if (need === 'information') keys.push('needInformation')
  else keys.push('needCheckOnMe')

  if (profile.language !== 'en') keys.push('needInterpreter')
  keys.push(profile.location ? 'atPlace' : 'placeUnknown')
  if (warning) keys.push('fireNear')

  if (hasNeed(profile, 'mobility')) keys.push('needMobility')
  if (hasNeed(profile, 'low-vision')) keys.push('needLowVision')
  if (hasNeed(profile, 'hearing')) keys.push('needHearing')
  if (hasNeed(profile, 'cognitive')) keys.push('needCognitive')
  if (hasNeed(profile, 'simpler')) keys.push('needSimpler')

  const transportLine = TRANSPORT_LINE[profile.transport]
  if (transportLine) keys.push(transportLine)

  const place = profile.location?.label ?? ''
  const pl = packLanguage(profile.language)

  // The English column is what the operator hears, so it stays in English.
  // "Another language" has no name we can give, so we say so plainly.
  const englishValues = {
    place,
    level: warning ? (LEVEL_LABEL[warning.level] ?? warning.level) : '',
    language: profile.language === 'other' ? 'a language not listed here' : LANGUAGE_IN_ENGLISH[pl],
  }

  // The translated column exists so the caller understands what they are
  // saying. Leaving "Mandarin" and "Emergency Warning" in English there
  // defeats the entire point of showing it.
  const pack = getPack(profile.language)
  const translatedValues = {
    place,
    level: warning ? pack.levelName[warning.level] : '',
    language: profile.language === 'other' ? pack.ui.languageOther : LANGUAGE_NAMES[pl],
  }

  return {
    english: keys.map((key) => fill(LINES.en[key], englishValues)),
    translated: keys.map((key) => fill(LINES[pl][key], translatedValues)),
  }
}
