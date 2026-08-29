import type { Warning } from '@/lib/domain/warning'
import type { LanguageCode, UserProfile } from '@/lib/domain/profile'
import { getPack, LANGUAGE_NAMES } from '@/lib/i18n'

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
  | 'mobilityLimited'
  | 'mobilityWheelchair'
  | 'mobilityBedbound'
  | 'transportNone'
  | 'transportLift'
  | 'needInterpreter'

const LEVEL_LABEL: Record<string, string> = {
  'emergency-warning': 'Emergency Warning',
  'watch-and-act': 'Watch and Act',
  advice: 'Advice',
  'planned-burn': 'Planned Burn',
  'not-applicable': 'incident',
}

/** The language name as an operator would recognise it. */
const LANGUAGE_IN_ENGLISH: Record<LanguageCode, string> = {
  en: 'English',
  zh: 'Mandarin',
  hi: 'Hindi',
  vi: 'Vietnamese',
}

const LINES: Record<LanguageCode, Record<LineKey, string>> = {
  en: {
    needEvacuate: 'Hello. I need help to leave my home because of a bush fire.',
    needInformation: 'Hello. I need information about a bush fire near me.',
    needCheckOnMe: 'Hello. I am not able to leave and I need someone to check on me.',
    atPlace: 'I am at {place}.',
    placeUnknown: 'I am in New South Wales. I can give you my address.',
    fireNear: 'There is a bush fire near me. The official warning is {level}.',
    mobilityLimited: 'I have difficulty walking.',
    mobilityWheelchair: 'I use a wheelchair.',
    mobilityBedbound: 'I am in bed and I cannot move without help.',
    transportNone: 'I do not have any transport.',
    transportLift: 'Someone may be able to drive me, but I am not sure.',
    needInterpreter: 'I speak {language}. Please connect me to an interpreter.',
  },
  zh: {
    needEvacuate: '您好。因为丛林火灾，我需要帮助离开家。',
    needInformation: '您好。我想了解我附近丛林火灾的情况。',
    needCheckOnMe: '您好。我无法离开，需要有人来看看我。',
    atPlace: '我在{place}。',
    placeUnknown: '我在新南威尔士州。我可以告诉您我的地址。',
    fireNear: '我附近有丛林火灾。官方警报级别是{level}。',
    mobilityLimited: '我走路有困难。',
    mobilityWheelchair: '我使用轮椅。',
    mobilityBedbound: '我卧床，没有帮助无法移动。',
    transportNone: '我没有任何交通工具。',
    transportLift: '可能有人可以载我，但我不确定。',
    needInterpreter: '我说{language}。请为我接通口译员。',
  },
  hi: {
    needEvacuate: 'नमस्ते। जंगल की आग के कारण मुझे अपना घर छोड़ने में मदद चाहिए।',
    needInformation: 'नमस्ते। मुझे अपने पास की जंगल की आग के बारे में जानकारी चाहिए।',
    needCheckOnMe: 'नमस्ते। मैं जा नहीं सकता/सकती, कोई मुझे देखने आ जाए।',
    atPlace: 'मैं {place} में हूँ।',
    placeUnknown: 'मैं न्यू साउथ वेल्स में हूँ। मैं आपको अपना पता बता सकता/सकती हूँ।',
    fireNear: 'मेरे पास जंगल की आग है। आधिकारिक चेतावनी {level} है।',
    mobilityLimited: 'मुझे चलने में कठिनाई होती है।',
    mobilityWheelchair: 'मैं व्हीलचेयर इस्तेमाल करता/करती हूँ।',
    mobilityBedbound: 'मैं बिस्तर पर हूँ और बिना मदद के हिल नहीं सकता/सकती।',
    transportNone: 'मेरे पास कोई साधन नहीं है।',
    transportLift: 'शायद कोई मुझे ले जा सके, पर मुझे यकीन नहीं है।',
    needInterpreter: 'मैं {language} बोलता/बोलती हूँ। कृपया मुझे दुभाषिये से जोड़ें।',
  },
  vi: {
    needEvacuate: 'Xin chào. Tôi cần giúp đỡ để rời khỏi nhà vì cháy rừng.',
    needInformation: 'Xin chào. Tôi cần thông tin về đám cháy rừng gần nhà tôi.',
    needCheckOnMe: 'Xin chào. Tôi không thể rời đi và cần ai đó đến xem tôi thế nào.',
    atPlace: 'Tôi đang ở {place}.',
    placeUnknown: 'Tôi đang ở New South Wales. Tôi có thể cho bạn địa chỉ của tôi.',
    fireNear: 'Có cháy rừng gần tôi. Mức cảnh báo chính thức là {level}.',
    mobilityLimited: 'Tôi đi lại khó khăn.',
    mobilityWheelchair: 'Tôi dùng xe lăn.',
    mobilityBedbound: 'Tôi nằm liệt giường và không thể di chuyển nếu không có người giúp.',
    transportNone: 'Tôi không có phương tiện nào.',
    transportLift: 'Có thể có người chở tôi, nhưng tôi không chắc.',
    needInterpreter: 'Tôi nói tiếng {language}. Xin hãy nối máy cho tôi với thông dịch viên.',
  },
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

  if (profile.mobility === 'limited-walking') keys.push('mobilityLimited')
  if (profile.mobility === 'wheelchair') keys.push('mobilityWheelchair')
  if (profile.mobility === 'bedbound') keys.push('mobilityBedbound')

  if (profile.transport === 'no-transport') keys.push('transportNone')
  if (profile.transport === 'can-get-lift') keys.push('transportLift')

  const place = profile.location?.label ?? ''

  // The English column is what the operator hears, so it stays in English.
  const englishValues = {
    place,
    level: warning ? (LEVEL_LABEL[warning.level] ?? warning.level) : '',
    language: LANGUAGE_IN_ENGLISH[profile.language],
  }

  // The translated column exists so the caller understands what they are
  // saying. Leaving "Mandarin" and "Emergency Warning" in English there
  // defeats the entire point of showing it.
  const pack = getPack(profile.language)
  const translatedValues = {
    place,
    level: warning ? pack.levelName[warning.level] : '',
    language: LANGUAGE_NAMES[profile.language],
  }

  return {
    english: keys.map((key) => fill(LINES.en[key], englishValues)),
    translated: keys.map((key) => fill(LINES[profile.language][key], translatedValues)),
  }
}
