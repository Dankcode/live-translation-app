'use client'

import React, { useState } from 'react'
import { useServerInsertedHTML } from 'next/navigation'
import { StyleRegistry, createStyleRegistry } from 'styled-jsx'

export default function StyledJsxRegistry({ children }) {
    // 确保 stylesheet 只创建一次
    const [jsxStyleRegistry] = useState(() => createStyleRegistry())

    useServerInsertedHTML(() => {
        const styles = jsxStyleRegistry.styles()
        jsxStyleRegistry.flush()
        return <>{styles}</>
    })

    return <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>
}
