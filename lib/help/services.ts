import type { AlertLevel } from '@/lib/domain/warning'
import {
  hasNeed,
  needsAssistedEvacuation,
  packLanguage,
  type PackLanguage,
  type UserProfile,
} from '@/lib/domain/profile'

export interface HelpContext {
  level: AlertLevel | null
  inside: boolean
  profile: UserProfile
}

export interface OfficialService {
  id: string
  /** Kept in English: this is the name the operator will answer with. */
  name: string
  /** Digits only, for the tel: link. */
  phone: string
  phoneDisplay: string
  descriptions: Record<PackLanguage, string>
  show: (context: HelpContext) => boolean
  priority: (context: HelpContext) => number
}

const isUrgent = (context: HelpContext): boolean =>
  context.inside || context.level === 'emergency-warning'

const needsAssistance = (context: HelpContext): boolean =>
  needsAssistedEvacuation(context.profile)

export const SERVICES: OfficialService[] = [
  {
    id: 'triple-zero',
    name: 'Triple Zero (Police, Fire, Ambulance)',
    phone: '000',
    phoneDisplay: '000',
    descriptions: {
      en: 'Call if you are in danger right now and need help immediately.',
      zh: '如果您现在有危险，需要立即救助，请拨打此号码。',
      ne: 'यदि तपाईं अहिले खतरामा हुनुहुन्छ र तुरुन्तै सहयोग चाहिन्छ भने फोन गर्नुहोस्।',
      ar: 'اتصل إذا كنت في خطر الآن وتحتاج مساعدة فورية.',
      hi: 'अगर आप अभी खतरे में हैं और तुरंत मदद चाहिए, तो यहाँ कॉल करें।',
      vi: 'Gọi nếu bạn đang gặp nguy hiểm và cần trợ giúp ngay lập tức.',
    },
    show: () => true,
    priority: (context) => (isUrgent(context) ? 100 : 50),
  },
  {
    id: 'tis-national',
    name: 'TIS National (free interpreter)',
    phone: '131450',
    phoneDisplay: '131 450',
    descriptions: {
      en: 'A free interpreter can join your call to any Australian service.',
      zh: '免费口译员可以加入您与任何澳大利亚机构的通话。',
      ne: 'निःशुल्क दोभाषे तपाईंको कुनै पनि अस्ट्रेलियाली सेवासँगको कुराकानीमा सामेल हुन सक्छन्।',
      ar: 'يمكن لمترجم فوري مجاني الانضمام إلى مكالمتك مع أي جهة أسترالية.',
      hi: 'एक मुफ़्त दुभाषिया किसी भी ऑस्ट्रेलियाई सेवा के साथ आपकी कॉल में जुड़ सकता है।',
      vi: 'Thông dịch viên miễn phí có thể tham gia cuộc gọi của bạn với bất kỳ dịch vụ nào ở Úc.',
    },
    show: (context) => context.profile.language !== 'en',
    priority: () => 90,
  },
  {
    id: 'service-nsw',
    name: 'Service NSW (evacuation and disaster help)',
    phone: '137788',
    phoneDisplay: '13 77 88',
    descriptions: {
      en: 'Ask about evacuation centres and help getting out if you cannot travel on your own.',
      zh: '可咨询疏散中心，以及在您无法自行前往时如何获得协助。',
      ne: 'निकासी केन्द्रबारे र आफैं जान नसक्दा सहयोगबारे सोध्नुहोस्।',
      ar: 'اسأل عن مراكز الإجلاء وعن المساعدة إذا كنت لا تستطيع الانتقال بنفسك.',
      hi: 'निकासी केंद्रों के बारे में और अगर आप खुद नहीं जा सकते तो मदद के बारे में पूछें।',
      vi: 'Hỏi về trung tâm sơ tán và cách được giúp đỡ nếu bạn không thể tự đi.',
    },
    show: () => true,
    priority: (context) => (needsAssistance(context) ? 85 : 30),
  },
  {
    id: 'rfs-info',
    name: 'NSW RFS Bush Fire Information Line',
    phone: '1800679737',
    phoneDisplay: '1800 679 737',
    descriptions: {
      en: 'Ask about a bush fire near you. This is not for emergencies.',
      zh: '可咨询您附近的丛林火灾情况。此号码不用于紧急求助。',
      ne: 'आफ्नो नजिकको वन डढेलोबारे सोध्नुहोस्। यो आपत्कालका लागि होइन।',
      ar: 'اسأل عن حريق أحراش قريب منك. هذا الرقم ليس للطوارئ.',
      hi: 'अपने पास की जंगल की आग के बारे में पूछें। यह आपात स्थिति के लिए नहीं है।',
      vi: 'Hỏi về đám cháy rừng gần bạn. Số này không dùng cho trường hợp khẩn cấp.',
    },
    show: () => true,
    priority: () => 60,
  },
  {
    id: 'relay-service',
    name: 'National Relay Service',
    phone: '133677',
    phoneDisplay: '133 677',
    descriptions: {
      en: 'Use this if you are deaf, or have difficulty hearing or speaking.',
      zh: '如果您失聪，或听力、语言有困难，可以使用此服务。',
      ne: 'तपाईं बहिरा हुनुहुन्छ, वा सुन्न-बोल्न गाह्रो छ भने यो प्रयोग गर्नुहोस्।',
      ar: 'استخدم هذه الخدمة إذا كنت أصمّ أو تجد صعوبة في السمع أو الكلام.',
      hi: 'अगर आप बहरे हैं, या सुनने-बोलने में कठिनाई है, तो इसका उपयोग करें।',
      vi: 'Dùng dịch vụ này nếu bạn bị điếc hoặc khó nghe, khó nói.',
    },
    show: () => true,
    priority: (context) => (hasNeed(context.profile, 'hearing') ? 88 : 20),
  },
  {
    id: 'ses',
    name: 'NSW SES (storm and flood)',
    phone: '132500',
    phoneDisplay: '132 500',
    descriptions: {
      en: 'For storm and flood damage, not fire.',
      zh: '用于风暴和洪水损失，不适用于火灾。',
      ne: 'आँधी र बाढीको क्षतिका लागि, आगोका लागि होइन।',
      ar: 'لأضرار العواصف والفيضانات، وليس للحرائق.',
      hi: 'तूफ़ान और बाढ़ के नुकसान के लिए, आग के लिए नहीं।',
      vi: 'Dành cho thiệt hại do bão và lũ, không phải cháy.',
    },
    show: () => true,
    priority: () => 10,
  },
]

export function rankServices(context: HelpContext): OfficialService[] {
  return SERVICES.filter((service) => service.show(context)).sort(
    (a, b) => b.priority(context) - a.priority(context),
  )
}
