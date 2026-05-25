declare module 'unique-selector' {
  type Options = {
    selectorTypes?: Array<'ID' | 'Class' | 'Tag' | 'NthChild' | 'data-*'>;
    excludeRegex?: RegExp | null;
  };
  function unique(el: Element, options?: Options): string;
  export default unique;
}
