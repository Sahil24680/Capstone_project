"use client";

import Auth_Form from "../Auth_Form";

export default function LoginPage() {
  return (
    <Auth_Form
      title="Welcome Back"
      button_txt="Log In"
      is_login={true}
      sub_text="Don't have an account?"
      link="Sign up"
    />
  );
}
