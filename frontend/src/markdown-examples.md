# Markdown Text Emphasis Examples for LLMs

## How to Use Different Text Sizes and Emphasis

### 1. Heading Hierarchy
```markdown
# Main Title (Largest - 2.5rem with glow)
## Section Header (2rem with glow)
### Subsection (1.5rem)
#### Detail Header (1.25rem underlined)
```

### 2. Emphasis Techniques

#### Basic Emphasis:
```markdown
*Italic text* or _italic text_ (slightly larger, light blue)
**Bold text** or __bold text__ (larger, bright cyan with glow)
***Bold and italic*** (largest, bright cyan with underline)
```

#### Special Emphasis Patterns:

**For Final Answers:**
```markdown
**The answer is 11**
```
This creates a boxed, highlighted answer when it's the only content in a paragraph.

**For Key Points:**
```markdown
### Key Insights:
- **Prime Digits:** The hundreds digit must be prime (2, 3, 5, or 7)
- **Difference Rule:** Let the number be 100a + 10b + c
- ***Critical Finding:*** a - c = 1 (most emphasized)
```

**For Important Calculations:**
```markdown
The equation `a - c = 1` implies that consecutive numbers satisfy our constraint.
```

### 3. Visual Hierarchy Example

```markdown
# Final Answer and Conclusion

## The answer is **11**

### Verification:
The number **362** satisfies all constraints:
- Tens digit (6) is the product of 3 × 2 ✓
- Difference: 362 - 263 = **99** ✓
- Sum of digits: 3 + 6 + 2 = ***11*** ✓

> **Both models reached consensus** with high confidence through:
> - Systematic enumeration
> - Mathematical verification
> - Independent validation
```

### 4. Combining Techniques

For maximum emphasis on critical information:
- Use `# Heading` for major sections
- Use `**bold**` for important values
- Use `***bold italic***` for the most critical findings
- Use inline `code` for formulas and calculations
- Use blockquotes with bold for consensus statements

### 5. Progressive Emphasis

1. Normal text for explanation
2. *Italic* for slight emphasis
3. **Bold** for important points
4. ***Bold Italic*** for critical findings
5. # Large Heading for final answers

This creates a clear visual hierarchy that guides the reader's attention to the most important information.