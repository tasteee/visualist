Always prioritize **clarity, readability, and explicitness** over brevity or cleverness.
Code should be written for junior devs and future readers, not for the author.
Favor **modular, flat, and maintainable** logic over complex, nested flows.
!! NEVER EVER DESTRUCTURE PROPS OR FUNCTION ARGUMENTS. !!

Use **named arrow functions** only — no anonymous or inline functions.
Use **named exports** only. Never use `default` exports.
Use explicit types for all complex function arguments.

i.e:

```
type FooBarArgsT = {
  value: string;
  count: number;
};

const fooBar = (args: FooBarArgsT) => { ... }
```

Define custom types using `type`, not `interface`, and suffix all with `T`. Example: `UserT`, `MessageT`, `ArgsT`.

Boolean variables must use interrogative prefixes: `isOpen`, `canEdit`, `hasError`, `didClick`.

Avoid `else`, `else if`, and `switch`. Prefer early returns and clean `if` guards.

Always flatten control flow. Never nest unnecessarily.

Always return early where possible — **never bury the exit**.

Avoid vertical "maze" logic — limit scrolling required to understand flow.

Always write **explicit** logic — no assumptions, no magic.

Never abbreviate — prefer long, descriptive variable names.

Avoid single-letter or ambiguous variables like `e`, `x`, `r`.

Avoid inline complex logic — extract complex logic into reusable helper functions.

Only allow implicit returns for _trivial_ one-liners (e.g. `array.forEach(item => item.stop())`).

Always access props with dot notation: `args.value` (**never destructure**).

## ✅ Examples of Preferred Patterns

```ts
type IsAuthorizedArgsT = {
	userId: string
	element: HTMLElement
}

export const isAuthorized = (args: IsAuthorizedArgsT) => {
	const isSameUser = args.userId === account.id
	if (!isSameUser) return false
	return true
}

// Doesnt need complex typed args, so single argument is fine.
export const getDimensions = (element: HTMLElement): DOMRect => {
	return element.getBoundingClientRect()
}
```

## ❌ Avoid These Patterns

```ts
// Avoid implicit, immediate returns.
const getData = (args: GetDataOptionsT) => ({
	result: args.a + args.b / 2
})

// Instead use a function block and return statement.
const getData = (args: GetDataOptionsT) => {
	const result = args.a + args.b / 2
	return { result }
}

// Avoid nesting or else blocks
if (foo) {
	doThis()
} else {
	doThat()
}

// Instead, return early
if (foo) return doThis()
doThat()

// Avoid destructuring in function signature
const fetchUser = ({ id, includePosts }: { id: string; includePosts: boolean }) => {
	// ...
}

// Instead, use a single argument object
type FetchUserArgsT = {
	id: string
	includePosts: boolean
}

const fetchUser = (args: FetchUserArgsT) => {
	const { id, includePosts } = args
	// ...
}
```

## more flat code examples, HIGH PRIORITY:

These examples show FLAT code expectations.
They also show how to create many variables
to increase readability, rather than running
inline computations that are hard to read.

```ts
export const fetchSoundfont = async (url: string): Promise<SoundFont> => {
	const [error, response] = await to(fetch(url))
	if (error) return throwShit('networkError', { error, url })
	const arrayBuffer = await response?.arrayBuffer()
	const buffer = new Uint8Array(arrayBuffer)
	const parsed = parse(buffer)
	const soundFont = new SoundFont(parsed)
	return soundFont
}

const clamp = (...args) => {
	// giving names to computed values:
	const isNormalClamp = args.length === 3
	const isOptionsClamp = typeof args[0] === 'object'

	// IF, BUT NOT ELSE.
	// RETURN EARLY INSTEAD.
	if (isNormalClamp) {
		const [min, value, max] = args as number[]
		if (value < min) return min
		if (value > max) return max
		return value
	}

	// FOLLOW IF WITH IF. THIS
	// IS FINE TO DO.
	if (isOptionsClamp) {
		const { min, value, max } = args as any
		if (value < min) return min
		if (value > max) return max
		return value
	}
}

// LOOK AT HOW FLAT AND CLEAN THIS
// COMPONENT IS. THE FUNCTIONS
// INSIDE OF IT ARE FLAT. THERE
// ARE TONS OF VARIABLES TO GIVE
// ENGLISH LANGUAGE READABILITY
// TO THE CODE EVEN FOR SIMPLE
// COMPUTATIONS LIKE chord.color
// + 'Accents', WE GIVE IT A
// READABLE NAME INSTEAD OF
// COMPUTING IT INLINE.

export const ChordBlock = observer((props: ChordBlockPropsT) => {
	const isMouseDown = useDatass.boolean(false)
	const chord = $chords.useChord(props.id)
	const accentsClassName = chord.color + 'Accents'
	const className = classNames('ChordBlock', accentsClassName)
	const addChord = () => $progression.addChord(chord)

	const keyCode = $input.getKeyCodeForChord(chord.id)
	const displayKey = $input.getKeyFromCode(keyCode)
	const isMappedKeyPressed = $input.checkKeyPressed(keyCode)

	const lastOctaveOffset = useLastValue(chord.octaveOffset)
	const lastInversion = useLastValue(chord.inversion)
	const lastVoicing = useLastValue(chord.voicing)
	const lastBassNote = useLastValue(chord.bassNote)

	const hasOctaveModifier = chord.octaveOffset !== 0
	const hasInversionModifier = chord.inversion !== 0
	const hasVoicingModifier = chord.voicing !== 'closed'
	const shouldShowResetIcon = hasOctaveModifier || hasInversionModifier || hasVoicingModifier

	const onMouseDown = (event: React.MouseEvent) => {
		const isLeftButton = event.button === 0
		if (!isLeftButton) return
		event.preventDefault()
		event.stopPropagation()
		console.log('Playing chord:', chord.symbol, toJS(chord))
		instrument.playChord(chord)
		isMouseDown.set(true)
	}

	const onMouseUp = (eevent: React.MouseEvent) => {
		const isLeftButton = event.button === 0
		if (!isLeftButton) return
		event.preventDefault()
		event.stopPropagation()
		instrument.stopChord(chord)
		isMouseDown.set(false)
	}

	const onMouseLeave = () => {
		if (!isMouseDown.state) return
		instrument.stopChord(chord)
		isMouseDown.set(false)
	}

	return <whatever />
})
```

## 🧭 Summary of DOs and DON'Ts

| ✅ DO                          | ❌ DON'T                           |
| ------------------------------ | ---------------------------------- |
| Use `type` + `T` suffix        | Use `interface` or omit suffixes   |
| Use named exports only         | Use `default` exports              |
| Access args via `args.value`   | Destructure in function signature  |
| Return early                   | Nest or bury control flow          |
| Use long, clear variable names | Use short or cryptic names         |
| Flatten logic                  | Use nested blocks or branches      |
| Extract named helpers          | Inline complex logic               |
| Write for human readability    | Optimize for brevity or cleverness |

```js
// GOOD: ALWAYS ALWAYS OMIT BLOCKS IF ONLY ONE STATEMENT NECESSARY
if (foo) return bar
if (!!abc) return doThis()

// BAD: USING BLOCKS FOR ONE STATEMENT CONDITIONS
if (foo) {
  return bar
}
```

## USE CAMEL CASE FOR ALL CSS CLASS NAMES.

```css
/* GOOD */
.myAwesomeClass {}
/* BAD */
.my_awesome-class {}
.my-awesome-class {}
.myawesomeclass {}
```

## 🛑 ABSOLUTELY NEVER USE DESTRUCTURING FOR PROPS OR FUNCTION ARGUMENTS. 🛑

Always access props and function arguments using dot notation.

## NEVER USE TAILWIND CSS UTILITIES. INSTEAD WRITE PURE CSS.

## ALWAYS WRITE FLAT, READABLE, AND EXPLICIT CODE. PRIORITIZE MAINTAINABILITY OVER BREVITY.