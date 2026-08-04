const chineseSegmenter = new Intl.Segmenter("zh-CN", { granularity: "word" })
const hanCharacter = /\p{Script=Han}/u

export function NaturalText({ text }: { readonly text: string }) {
  return [...chineseSegmenter.segment(text)].map((part) =>
    part.isWordLike && hanCharacter.test(part.segment) ? (
      <span className="text-phrase" key={part.index}>
        {part.segment}
      </span>
    ) : (
      part.segment
    ),
  )
}
